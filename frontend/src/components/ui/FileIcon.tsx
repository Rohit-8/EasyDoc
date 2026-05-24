import { FileText, FileSpreadsheet, File, FileType } from 'lucide-react';
import { clsx } from 'clsx';

const iconMap: Record<string, { icon: typeof FileText; color: string }> = {
  'application/pdf': { icon: FileText, color: 'text-red-400 bg-red-400/10' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: FileType, color: 'text-blue-400 bg-blue-400/10' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { icon: FileSpreadsheet, color: 'text-emerald-400 bg-emerald-400/10' },
  'text/csv': { icon: FileSpreadsheet, color: 'text-emerald-400 bg-emerald-400/10' },
  'text/plain': { icon: File, color: 'text-zinc-400 bg-zinc-400/10' },
  'text/markdown': { icon: File, color: 'text-zinc-400 bg-zinc-400/10' },
};

export default function FileIcon({ mimeType, size = 'md' }: { mimeType: string; size?: 'sm' | 'md' | 'lg' }) {
  const cfg = iconMap[mimeType] || { icon: File, color: 'text-zinc-400 bg-zinc-400/10' };
  const Icon = cfg.icon;
  const sizes = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-12 h-12' };
  const iconSizes = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' };

  return (
    <div className={clsx('rounded-lg flex items-center justify-center', sizes[size], cfg.color)}>
      <Icon className={iconSizes[size]} />
    </div>
  );
}
