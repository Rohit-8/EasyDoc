import { FileSearch } from 'lucide-react';

export default function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
        <FileSearch className="w-7 h-7 text-text-tertiary" />
      </div>
      <h3 className="text-[15px] font-medium text-text-primary mb-1.5">{title}</h3>
      <p className="text-sm text-text-tertiary max-w-[280px] text-center mb-5">{description}</p>
      {action}
    </div>
  );
}
