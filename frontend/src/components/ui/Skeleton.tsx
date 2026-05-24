import { clsx } from 'clsx';

export default function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'animate-pulse bg-surface-3 rounded',
        className,
      )}
    />
  );
}

export function DocumentCardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-3 w-24" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}
