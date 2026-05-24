import { useCallback } from 'react';

export function useSSE(url: string) {
  const stream = useCallback(
    async (
      body: Record<string, unknown>,
      onToken: (token: string) => void,
      onDone: (data: Record<string, unknown>) => void,
      onError: (error: string) => void,
    ) => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const err = await response.json();
          onError(err.error?.message || 'Request failed');
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) { onError('No response stream'); return; }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'token') {
                  onToken(data.content);
                } else if (data.type === 'done') {
                  onDone(data);
                }
              } catch { /* skip malformed lines */ }
            }
          }
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Stream failed');
      }
    },
    [url],
  );

  return { stream };
}
