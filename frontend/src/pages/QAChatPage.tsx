import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Loader2, BookOpen, Sparkles } from 'lucide-react';
import { getDocument } from '@/services/api';
import { useSSE } from '@/hooks/useSSE';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: {
    chunkIndex: number;
    pageNumber: number | null;
    section: string | null;
    text: string;
    similarity: number;
  }[];
  isStreaming?: boolean;
}

export default function QAChatPage() {
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: doc } = useQuery({
    queryKey: ['document', id],
    queryFn: () => getDocument(id!),
    enabled: !!id,
  });

  const { stream } = useSSE(`/api/documents/${id}/ask`);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSubmit = async () => {
    const question = input.trim();
    if (!question || isLoading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setIsLoading(true);

    // Add empty assistant message for streaming
    const assistantIndex = messages.length + 1;
    setMessages((prev) => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

    await stream(
      { question, topK: 5 },
      // onToken
      (token) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + token };
          }
          return updated;
        });
      },
      // onDone
      (data) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: (data.answer as string) || last.content,
              citations: data.citations as Message['citations'],
              isStreaming: false,
            };
          }
          return updated;
        });
        setIsLoading(false);
      },
      // onError
      (error) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: `Error: ${error}`, isStreaming: false };
          }
          return updated;
        });
        setIsLoading(false);
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 h-14 border-b border-border flex items-center px-4 sm:px-5 gap-3">
        <Link to={`/documents/${id}`} className="btn-ghost p-1.5">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0">
          <p className="text-[13px] font-medium truncate">{doc?.fileName || 'Document'}</p>
          <p className="text-2xs text-text-tertiary">AI-Powered Q&A</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-accent-subtle border border-accent/10 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-[15px] font-medium mb-1">Ask anything about this document</h3>
            <p className="text-sm text-text-tertiary max-w-[320px]">
              Responses are grounded in the document content with traceable citations.
            </p>
            <div className="flex flex-wrap gap-2 mt-5 max-w-sm sm:max-w-md justify-center">
              {[
                'What are the key points?',
                'Summarize the main findings',
                'What dates are mentioned?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="text-[13px] px-3 py-1.5 rounded-full bg-surface-2 border border-border
                             text-text-secondary hover:bg-surface-3 hover:text-text-primary
                             transition-all duration-150"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] sm:max-w-[600px] rounded-xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-accent text-text-inverse'
                  : 'bg-surface-2 border border-border'
              }`}
            >
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>

              {msg.isStreaming && (
                <span className="inline-block w-1.5 h-4 bg-accent animate-pulse-soft ml-0.5" />
              )}

              {/* Citations */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border-subtle space-y-2">
                  <p className="text-2xs font-medium text-text-tertiary uppercase tracking-wider flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    Sources
                  </p>
                  {msg.citations.map((c, j) => (
                    <div key={j} className="text-2xs text-text-tertiary bg-surface-1 rounded px-2.5 py-1.5 border border-border-subtle">
                      <span className="text-accent font-mono">[{c.chunkIndex + 1}]</span>
                      {c.pageNumber && <span> Page {c.pageNumber}</span>}
                      {c.section && <span> · {c.section}</span>}
                      <span className="ml-1 text-text-tertiary">({(c.similarity * 100).toFixed(0)}%)</span>
                      <p className="mt-0.5 text-text-tertiary line-clamp-2">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-border p-3 sm:p-4">
        <div className="max-w-[720px] mx-auto relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about this document..."
            rows={1}
            className="input-base pr-12 resize-none min-h-[44px] max-h-[120px]"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded
                       text-text-tertiary hover:text-accent disabled:opacity-30
                       transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
