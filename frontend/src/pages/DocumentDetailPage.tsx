import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, MessageSquare, Clock, Hash, Layers, Cpu,
  User, Building, Calendar, DollarSign, MapPin, RefreshCw,
} from 'lucide-react';
import { getDocument } from '@/services/api';
import StatusBadge from '@/components/ui/StatusBadge';
import FileIcon from '@/components/ui/FileIcon';
import Skeleton from '@/components/ui/Skeleton';

const entityIcons: Record<string, typeof User> = {
  people: User,
  organizations: Building,
  dates: Calendar,
  monetary: DollarSign,
  locations: MapPin,
};

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: doc, isLoading } = useQuery({
    queryKey: ['document', id],
    queryFn: () => getDocument(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'processing' ? 3000 : false;
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-[960px] mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!doc) return null;

  const summary = doc.summary as { brief?: string; detailed?: string } | null;
  const entities = doc.entities as Record<string, string[]> | null;

  return (
    <div className="p-6 max-w-[960px] mx-auto animate-fade-in">
      {/* Back */}
      <Link to="/" className="btn-ghost text-[13px] -ml-3 mb-4 inline-flex">
        <ArrowLeft className="w-4 h-4" />
        Back to documents
      </Link>

      {/* Header */}
      <div className="card p-5 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <FileIcon mimeType={doc.mimeType} size="lg" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{doc.fileName}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-text-tertiary">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(doc.uploadedAt).toLocaleDateString()}
                </span>
                {doc.pageCount && (
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" />
                    {doc.pageCount} pages
                  </span>
                )}
                {doc.chunkCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5" />
                    {doc.chunkCount} chunks
                  </span>
                )}
                {doc.processingDurationMs && (
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5" />
                    {(doc.processingDurationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={doc.status} />
            {doc.status === 'ready' && (
              <Link to={`/documents/${id}/chat`} className="btn-primary text-[13px]">
                <MessageSquare className="w-4 h-4" />
                Ask Questions
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Processing state */}
      {(doc.status === 'queued' || doc.status === 'processing') && (
        <div className="card p-8 text-center">
          <div className="flex justify-center mb-4">
            <RefreshCw className="w-8 h-8 text-accent animate-spin" />
          </div>
          <p className="text-[15px] font-medium">Processing your document...</p>
          <p className="text-sm text-text-tertiary mt-1">
            Parsing, chunking, embedding, and analyzing with AI. This may take a moment.
          </p>
        </div>
      )}

      {doc.status === 'error' && (
        <div className="card p-5 border-status-error/30">
          <p className="text-[15px] font-medium text-status-error">Processing failed</p>
          <p className="text-sm text-text-tertiary mt-1">{doc.errorMessage || 'Unknown error'}</p>
        </div>
      )}

      {doc.status === 'ready' && (
        <div className="space-y-4">
          {/* Summary */}
          {summary && (
            <div className="card p-5">
              <h2 className="text-[13px] font-medium text-text-tertiary uppercase tracking-wider mb-3">Summary</h2>
              <p className="text-[14px] leading-relaxed text-text-secondary">{summary.brief}</p>
              {summary.detailed && (
                <details className="mt-3">
                  <summary className="text-[13px] text-accent cursor-pointer hover:text-accent-hover transition-colors">
                    Show detailed summary
                  </summary>
                  <p className="mt-2 text-[14px] leading-relaxed text-text-secondary whitespace-pre-wrap">
                    {summary.detailed}
                  </p>
                </details>
              )}
            </div>
          )}

          {/* Classification */}
          {doc.classificationDetails && (
            <div className="card p-5">
              <h2 className="text-[13px] font-medium text-text-tertiary uppercase tracking-wider mb-3">Classification</h2>
              <div className="flex items-center gap-3">
                <span className="badge bg-accent-muted text-accent text-xs px-3 py-1">
                  {(doc.classificationDetails as { type: string }).type}
                </span>
                {(doc.classificationDetails as { subtype?: string }).subtype && (
                  <span className="badge bg-surface-3 text-text-secondary text-xs px-3 py-1">
                    {(doc.classificationDetails as { subtype: string }).subtype}
                  </span>
                )}
                <span className="text-2xs text-text-tertiary">
                  {((doc.classificationDetails as { confidence: number }).confidence * 100).toFixed(0)}% confidence
                </span>
              </div>
            </div>
          )}

          {/* Entities */}
          {entities && Object.keys(entities).length > 0 && (
            <div className="card p-5">
              <h2 className="text-[13px] font-medium text-text-tertiary uppercase tracking-wider mb-4">Extracted Entities</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(entities).map(([type, items]) => {
                  if (!items || items.length === 0) return null;
                  const Icon = entityIcons[type] || User;
                  return (
                    <div key={type}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-3.5 h-3.5 text-text-tertiary" />
                        <span className="text-2xs font-medium text-text-tertiary uppercase tracking-wider">
                          {type}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((item: string, i: number) => (
                          <span key={i} className="badge bg-surface-3 text-text-secondary text-2xs">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Version History */}
          {doc.versions && doc.versions.length > 0 && (
            <div className="card p-5">
              <h2 className="text-[13px] font-medium text-text-tertiary uppercase tracking-wider mb-3">Version History</h2>
              <div className="space-y-2">
                {doc.versions.map((v: { version: number; id: string; createdAt: string; modelUsed: string }) => (
                  <div key={v.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-2xs font-mono bg-surface-3 px-2 py-0.5 rounded">v{v.version}</span>
                      <span className="text-sm text-text-secondary">{new Date(v.createdAt).toLocaleDateString()}</span>
                    </div>
                    {v.modelUsed && (
                      <span className="text-2xs text-text-tertiary font-mono">{v.modelUsed}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
