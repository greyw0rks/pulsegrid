export function formatDate(value: string | null) {
  if (!value) return "Not observed";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}

export function formatPercent(value: number | null) {
  return value === null ? "No samples" : `${value.toFixed(value >= 99 ? 2 : 1)}%`;
}

export function shortHash(value: string | null, size = 8) {
  return value ? `${value.slice(0, size + 2)}...${value.slice(-size)}` : "Not available";
}

export function ledgerLabel(value: string) {
  return value.replaceAll("_", " ");
}
