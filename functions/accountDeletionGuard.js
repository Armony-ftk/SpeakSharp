async function accountDeletionPending(transaction, db, uid) {
  return (await transaction.get(db.doc(`accountDeletions/${uid}`))).exists;
}
module.exports = { accountDeletionPending };
