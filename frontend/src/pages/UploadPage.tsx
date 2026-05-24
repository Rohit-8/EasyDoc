import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { Upload, FileUp, X, Check, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { uploadDocument } from '@/services/api';
import FileIcon from '@/components/ui/FileIcon';
import toast from 'react-hot-toast';

const mimeMap: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

export default function UploadPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);

  const mutation = useMutation({
    mutationFn: (file: File) => uploadDocument(file),
    onSuccess: (res) => {
      toast.success('Document uploaded');
      navigate(`/documents/${res.data.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const onDrop = useCallback((accepted: File[]) => {
    setFiles(accepted);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
  });

  const file = files[0];
  const ext = file ? '.' + file.name.split('.').pop()?.toLowerCase() : '';
  const mime = mimeMap[ext] || 'text/plain';

  return (
    <div className="p-4 sm:p-6 max-w-[640px] mx-auto animate-fade-in">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Upload Document</h1>
        <p className="text-sm text-text-tertiary mt-0.5">
          Drag & drop or click to upload. Supports PDF, DOCX, XLSX, CSV, TXT, MD.
        </p>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer
          transition-all duration-200
          ${isDragActive
            ? 'border-accent bg-accent-subtle'
            : 'border-border hover:border-border-hover hover:bg-surface-1'
          }
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center">
            <Upload className={`w-6 h-6 ${isDragActive ? 'text-accent' : 'text-text-tertiary'}`} />
          </div>
          <div>
            <p className="text-[15px] font-medium">
              {isDragActive ? 'Drop file here' : 'Drop file here or click to browse'}
            </p>
            <p className="text-sm text-text-tertiary mt-1">Max 50 MB</p>
          </div>
        </div>
      </div>

      {/* Selected file */}
      {file && (
        <div className="card mt-4 p-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <FileIcon mimeType={mime} size="sm" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium truncate">{file.name}</p>
                <p className="text-2xs text-text-tertiary">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            <button
              onClick={() => setFiles([])}
              className="p-1.5 rounded hover:bg-surface-3 transition-colors"
            >
              <X className="w-4 h-4 text-text-tertiary" />
            </button>
          </div>

          <button
            onClick={() => mutation.mutate(file)}
            disabled={mutation.isPending}
            className="btn-primary w-full mt-4 text-[13px]"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <FileUp className="w-4 h-4" />
                Upload & Analyze
              </>
            )}
          </button>
        </div>
      )}

      {/* File types */}
      <div className="mt-6 sm:mt-8 space-y-3">
        <p className="text-2xs font-medium text-text-tertiary uppercase tracking-wider">Supported formats</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { ext: 'PDF', desc: 'Documents' },
            { ext: 'DOCX', desc: 'Word files' },
            { ext: 'XLSX', desc: 'Spreadsheets' },
            { ext: 'CSV', desc: 'Data files' },
            { ext: 'TXT', desc: 'Plain text' },
            { ext: 'MD', desc: 'Markdown' },
          ].map(({ ext, desc }) => (
            <div key={ext} className="flex items-center gap-2 px-3 py-2 rounded bg-surface-1 border border-border-subtle">
              <span className="text-2xs font-mono font-medium text-accent">.{ext.toLowerCase()}</span>
              <span className="text-2xs text-text-tertiary">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
