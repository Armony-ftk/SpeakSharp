const { randomUUID, createHash } = require("node:crypto");
const { FieldPath } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");

const hashReceipt = (receipt) => createHash("sha256").update(receipt).digest("hex");
const validReceipt = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

// Kept outside users/{uid}: denies old-token profile recreation and survives
// recursiveDelete. It contains no email, password, audio or presentation data.
function createAccountDeletion({ db, auth, bucket, logger, now = Date.now }) {
  return async (request) => {
    const { receipt, confirmOnly = false } = request.data ?? {};
    // A read-only completion receipt also works after Auth has been deleted.
    // A 256-bit capability reveals only completion, never authorizes any writes.
    if (confirmOnly === true) {
      if (!validReceipt(receipt)) throw new HttpsError("unauthenticated", "A deletion receipt is required.");
      const found = await db.collection("accountDeletions")
        .where("receiptHashes", "array-contains", hashReceipt(receipt)).limit(1).get();
      const marker = found.docs[0]?.data();
      if (!marker || marker.phase !== "data_deleted") return { success: false };
      try { await auth.getUser(found.docs[0].id); return { success: false }; }
      catch (error) {
        if (error?.code === "auth/user-not-found") return { success: true };
        throw new HttpsError("unavailable", "Deletion could not be confirmed. Please retry.");
      }
    }
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Please sign in again.");
    const authTime = request.auth.token?.auth_time;
    if (!Number.isFinite(authTime) || now() / 1000 - authTime > 300 || authTime > now() / 1000 + 30) {
      throw new HttpsError("failed-precondition", "Please confirm your password again.");
    }
    if (!validReceipt(receipt)) throw new HttpsError("invalid-argument", "A deletion receipt is required.");
    if (request.auth.token?.admin === true) throw new HttpsError("permission-denied", "Administrator accounts cannot use self-service deletion.");
    const profileRef = db.doc(`users/${uid}`);
    const markerRef = db.doc(`accountDeletions/${uid}`);
    const lease = randomUUID();
    let acquired = false;
    let stage = "authorization";
    try {
      let user;
      try { user = await auth.getUser(uid); }
      catch (error) { if (error?.code !== "auth/user-not-found") throw error; }
      if (user?.customClaims?.admin === true || user?.disabled) {
        throw new HttpsError("permission-denied", "Account deletion is not permitted for this account.");
      }
      await db.runTransaction(async (transaction) => {
        const marker = await transaction.get(markerRef);
        const profile = await transaction.get(profileRef);
        if (!user && !marker.exists) throw new HttpsError("permission-denied", "This account is unavailable.");
        if (profile.data()?.disabled === true) throw new HttpsError("permission-denied", "This account is unavailable.");
        if ((marker.data()?.leaseUntil ?? 0) > now()) throw new HttpsError("aborted", "Deletion is already running. Please check again shortly.");
        const hashes = marker.data()?.receiptHashes ?? [];
        const receiptHash = hashReceipt(receipt);
        if (!hashes.includes(receiptHash) && hashes.length >= 8) throw new HttpsError("resource-exhausted", "Resume deletion from the device where it started.");
        transaction.set(markerRef, { phase: marker.data()?.phase ?? "pending", lease,
          leaseUntil: now() + 600000, receiptHashes: [...new Set([...hashes, receiptHash])] });
        if (profile.exists) transaction.update(profileRef, { deleting: true });
      });
      acquired = true;
      stage = "sessions";
      // Firestore rules deny new sessions as soon as the checkpoint is committed.
      // Reuse the session guard already consumed by Storage's two-document rules.
      let after;
      for (;;) {
        let query = profileRef.collection("sessions").orderBy(FieldPath.documentId()).limit(200);
        if (after) query = query.startAfter(after);
        const page = await query.get();
        if (page.empty) break;
        const batch = db.batch();
        page.docs.forEach((doc) => batch.update(doc.ref, { deleting: true }));
        await batch.commit();
        after = page.docs.at(-1);
      }
      const prefixes = [`recordings/${uid}/`, `users/${uid}/`];
      async function sweep(verify = false) {
        for (const prefix of prefixes) {
          let pageToken;
          do {
            const [files, next] = await bucket.getFiles({ prefix, maxResults: 200, autoPaginate: false, pageToken });
            if (verify && files.length) throw new Error("Audio cleanup incomplete");
            // Bounded concurrency; includes orphans with no recording document.
            for (let offset = 0; offset < files.length; offset += 10) {
              const results = await Promise.allSettled(files.slice(offset, offset + 10).map((file) => file.delete({ ignoreNotFound: true })));
              const failure = results.find((result) => result.status === "rejected");
              if (failure) throw failure.reason;
            }
            pageToken = next?.pageToken;
          } while (pageToken);
        }
      }
      stage = "storage";
      await sweep();
      stage = "firestore";
      await db.recursiveDelete(profileRef);
      // listDocuments includes missing parent documents with surviving children.
      if ((await profileRef.get()).exists || (await profileRef.listCollections()).length) {
        throw new Error("Document cleanup incomplete");
      }
      stage = "verification";
      await sweep();
      await sweep(true);
      // Durable proof that all data operations finished BEFORE Auth deletion.
      // Auth is the last destructive operation. Confirmation checks Auth live.
      await markerRef.update({ phase: "data_deleted" });
      stage = "authentication";
      try { await auth.deleteUser(uid); }
      catch (error) { if (error?.code !== "auth/user-not-found") throw error; }
      try { await auth.getUser(uid); throw new Error("Authentication cleanup incomplete"); }
      catch (error) { if (error?.code !== "auth/user-not-found") throw error; }
      return { success: true };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("Account deletion incomplete", { stage, code: "deletion_unavailable" });
      throw new HttpsError("unavailable", "Deletion could not finish. Your account remains paused. Resume deletion to retry.");
    } finally {
      if (acquired) {
        // A crashed invocation's lease expires after the function's hard timeout.
        // An ordinary failure releases it immediately without clearing the guard.
        await db.runTransaction(async (transaction) => {
          const marker = await transaction.get(markerRef);
          if (marker.data()?.lease === lease) transaction.update(markerRef, { leaseUntil: 0 });
        }).catch(() => {});
      }
    }
  };
}

module.exports = { createAccountDeletion };
