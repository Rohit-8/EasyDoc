export interface Chunk {
  content: string;
  chunkIndex: number;
  pageNumber?: number;
  section?: string;
  tokenCount: number;
}

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 200;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkText(text: string, pageCount: number): Chunk[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (estimateTokens(currentChunk + '\n' + trimmed) > CHUNK_SIZE && currentChunk) {
      chunks.push({
        content: currentChunk.trim(),
        chunkIndex,
        pageNumber: pageCount > 0 ? Math.ceil(((chunkIndex + 1) / Math.max(chunks.length + 5, 1)) * pageCount) : undefined,
        tokenCount: estimateTokens(currentChunk),
      });
      chunkIndex++;

      // Overlap: keep last portion
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.ceil(CHUNK_OVERLAP / 4));
      currentChunk = overlapWords.join(' ') + '\n' + trimmed;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + trimmed;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      chunkIndex,
      pageNumber: pageCount > 0 ? pageCount : undefined,
      tokenCount: estimateTokens(currentChunk),
    });
  }

  return chunks;
}
