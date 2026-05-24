import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Trash2, ExternalLink, Clock, HardDrive } from 'lucide-react';
import { useState } from 'react';
import { getDocuments, deleteDocument } from '@/services/api';
import StatusBadge from '@/components/ui/StatusBadge';
import FileIcon from '@/components/ui/FileIcon';
import EmptyState from '@/components/ui/EmptyState';
import { DocumentCardSkeleton } from '@/components/ui/Skeleton';
import toast from 'react-hot-toast';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DocumentsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['documents', search, statusFilter],
    queryFn: () => getDocuments({ search, status: statusFilter, limit: 50 }),
    refetchInterval: (query) => {
      const docs = query.state.data?.data;
      const hasActive = docs?.some((d: { status: string }) => d.status === 'queued' || d.status === 'processing');
      return hasActive ? 5000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const documents = data?.data || [];
  const statuses = ['', 'queued', 'processing', 'ready', 'error'];

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-text-tertiary mt-0.5">
            {data?.pagination?.total ?? '—'} documents
          </p>
        </div>
        <Link to="/upload" className="btn-primary text-[13px]">
          Upload Document
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base pl-9"
          />
        </div>
        <div className="flex gap-1">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`btn-ghost text-[13px] ${statusFilter === s ? 'bg-surface-3 text-text-primary' : ''}`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <DocumentCardSkeleton key={i} />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Upload your first document to get started with AI-powered analysis."
          action={
            <Link to="/upload" className="btn-primary text-[13px]">
              Upload Document
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {documents.map((doc: Record<string, unknown>) => (
            <Link
              key={doc.id as string}
              to={`/documents/${doc.id}`}
              className="card p-4 hover:border-border-hover transition-all duration-200 group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileIcon mimeType={doc.mimeType as string} size="sm" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate group-hover:text-accent transition-colors">
                      {doc.fileName as string}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-2xs text-text-tertiary">
                      <HardDrive className="w-3 h-3" />
                      <span>{formatBytes(doc.fileSize as number)}</span>
                      <span>·</span>
                      <Clock className="w-3 h-3" />
                      <span>{timeAgo(doc.uploadedAt as string)}</span>
                    </div>
                  </div>
                </div>
                <StatusBadge status={doc.status as string} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  {doc.classification ? (
                    <span className="badge bg-accent-subtle text-accent">
                      {String(doc.classification)}
                    </span>
                  ) : null}
                  {(doc.pageCount as number) > 0 && (
                    <span className="badge bg-surface-3 text-text-tertiary">
                      {doc.pageCount as number} pages
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm('Delete this document?')) {
                      deleteMutation.mutate(doc.id as string);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-status-error/10 hover:text-status-error transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
