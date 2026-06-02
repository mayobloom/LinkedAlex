import { useUsageStore } from '../store/usageStore';

function formatReset(seconds: number | null) {
  if (seconds == null) return 'reset unknown';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m to reset`;
}

export function UsageBar() {
  const usage = useUsageStore((state) => state.usage);
  const hasUsage = usage.limit != null && usage.remaining != null && usage.limit > 0;
  const percent = hasUsage ? Math.max(0, Math.min(100, (usage.remaining! / usage.limit!) * 100)) : 0;
  const used = hasUsage ? usage.limit! - usage.remaining! : usage.credits_used;
  const remainingPercent = `${percent.toFixed(1)}%`;

  return (
    <div className="usage-shell" title={usage.error ?? undefined}>
      <div className="usage-fill" style={{ width: `${percent}%` }} />
      <div className="usage-label">
        {hasUsage ? (
          <>
            <span>
              {(used ?? 0).toLocaleString()} used / {usage.remaining!.toLocaleString()} credits left ({remainingPercent})
            </span>
            <span>{formatReset(usage.reset_seconds)}</span>
          </>
        ) : (
          <span>{usage.error ? 'OpenAlex usage unavailable' : 'OpenAlex usage pending'}</span>
        )}
      </div>
    </div>
  );
}
