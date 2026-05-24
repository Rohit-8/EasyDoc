import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Save, Check, Loader2, Cpu, Zap, Server, HardDrive } from 'lucide-react';
import { getProviders, getModelAssignments, updateModelAssignments } from '@/services/api';
import toast from 'react-hot-toast';

const taskLabels: Record<string, { label: string; description: string }> = {
  summarization: { label: 'Summarization', description: 'Model for generating document summaries' },
  classification: { label: 'Classification', description: 'Model for detecting document type' },
  entityExtraction: { label: 'Entity Extraction', description: 'Model for extracting names, dates, amounts' },
  qa: { label: 'Q&A (RAG)', description: 'Model for answering questions about documents' },
  embedding: { label: 'Embedding', description: 'Model for generating vector embeddings' },
};

const providerIcons: Record<string, typeof Cpu> = {
  gemini: Zap,
  groq: Cpu,
  nvidia: Server,
  ollama: HardDrive,
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const { data: providersData } = useQuery({
    queryKey: ['providers'],
    queryFn: getProviders,
  });

  const { data: assignmentsData } = useQuery({
    queryKey: ['assignments'],
    queryFn: getModelAssignments,
  });

  useEffect(() => {
    if (assignmentsData?.assignments) {
      setAssignments(assignmentsData.assignments);
    }
  }, [assignmentsData]);

  const mutation = useMutation({
    mutationFn: updateModelAssignments,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      toast.success('Settings saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const providers = providersData?.providers || [];
  const allModels = providers.flatMap((p: { id: string; models: { id: string }[] }) =>
    p.models.map((m: { id: string }) => ({ ...m, providerId: p.id })),
  );

  return (
    <div className="p-6 max-w-[720px] mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-text-tertiary mt-0.5">
          Configure model assignments and view active providers.
        </p>
      </div>

      {/* Active Providers */}
      <div className="card p-5 mb-6">
        <h2 className="text-[13px] font-medium text-text-tertiary uppercase tracking-wider mb-4">
          Active Providers
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {['gemini', 'groq', 'nvidia', 'ollama'].map((pid) => {
            const provider = providers.find((p: { id: string }) => p.id === pid);
            const Icon = providerIcons[pid] || Cpu;
            const active = !!provider;

            return (
              <div
                key={pid}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                  active
                    ? 'border-status-success/30 bg-status-success/5'
                    : 'border-border bg-surface-2 opacity-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-status-success' : 'text-text-tertiary'}`} />
                <div>
                  <p className="text-[13px] font-medium capitalize">{pid === 'ollama' ? 'Ollama (Local)' : pid}</p>
                  <p className="text-2xs text-text-tertiary">
                    {active ? `${provider.models.length} models` : 'Not configured'}
                  </p>
                </div>
                <div className="ml-auto">
                  {active ? (
                    <span className="w-2 h-2 rounded-full bg-status-success" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-surface-4" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Model Assignment */}
      <div className="card p-5">
        <h2 className="text-[13px] font-medium text-text-tertiary uppercase tracking-wider mb-4">
          Model Assignment
        </h2>
        <div className="space-y-4">
          {Object.entries(taskLabels).map(([task, { label, description }]) => (
            <div key={task}>
              <label className="block text-[13px] font-medium mb-1">{label}</label>
              <p className="text-2xs text-text-tertiary mb-2">{description}</p>
              <select
                value={assignments[task] || ''}
                onChange={(e) => setAssignments((prev) => ({ ...prev, [task]: e.target.value }))}
                className="input-base appearance-none"
              >
                <option value="">Auto-select</option>
                {providers.map((provider: { id: string; name: string; models: { id: string }[]; embeddingModels?: { id: string }[] }) => {
                  const modelList = task === 'embedding'
                    ? (provider.embeddingModels || [])
                    : provider.models;
                  if (modelList.length === 0) return null;
                  return (
                    <optgroup key={provider.id} label={provider.name}>
                      {modelList.map((model: { id: string }) => (
                        <option key={model.id} value={model.id}>
                          {model.id}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          ))}
        </div>

        <button
          onClick={() => mutation.mutate(assignments)}
          disabled={mutation.isPending}
          className="btn-primary w-full mt-6 text-[13px]"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : mutation.isSuccess ? (
            <>
              <Check className="w-4 h-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
