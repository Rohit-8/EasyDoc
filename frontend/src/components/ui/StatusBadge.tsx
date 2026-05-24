import { clsx } from 'clsx';

type StatusType = 'queued' | 'processing' | 'ready' | 'error';

const config: Record<StatusType, { label: string; color: string; dot: string }> = {
  queued: { label: 'Queued', color: 'bg-status-warning/10 text-status-warning', dot: 'bg-status-warning' },
  processing: { label: 'Processing', color: 'bg-status-info/10 text-status-info', dot: 'bg-status-info animate-pulse-soft' },
  ready: { label: 'Ready', color: 'bg-status-success/10 text-status-success', dot: 'bg-status-success' },
  error: { label: 'Error', color: 'bg-status-error/10 text-status-error', dot: 'bg-status-error' },
};

export default function StatusBadge({ status }: { status: string }) {
  const cfg = config[status as StatusType] || config.queued;
  return (
    <span className={clsx('badge gap-1.5', cfg.color)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}
