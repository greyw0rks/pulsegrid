type Props = { status: string; label?: string };

export function StatusBadge({ status, label }: Props) {
  const normalized = status.toLowerCase().replaceAll("_", "-");
  const tone = ["healthy", "confirmed", "resolved"].some(value => normalized.includes(value)) ? "healthy"
    : ["down", "failed", "exhausted", "error"].some(value => normalized.includes(value)) ? "failed"
      : ["queued", "submitted", "prepared", "pending", "retry", "stale", "degraded", "waiting"].some(value => normalized.includes(value)) ? "pending"
        : normalized;
  return <span className={`status status-${tone}`}>{label ?? status.replaceAll("_", " ")}</span>;
}
