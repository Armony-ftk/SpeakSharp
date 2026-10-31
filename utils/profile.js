export function getFullName(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getInitials(name) {
  return getFullName(name).split(/\s+/).filter(Boolean).slice(0, 2)
    .map((word) => word[0].toUpperCase()).join("");
}

export function formatMemberSince(timestamp) {
  try {
    const date = typeof timestamp?.toDate === "function" ? timestamp.toDate() : timestamp;
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) : "—";
  } catch {
    return "—";
  }
}
