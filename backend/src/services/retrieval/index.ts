import { prisma } from '../../config/database.js';
import { generateEmbedding } from '../embedding/index.js';

export interface RetrievedChunk {
  id: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  section: string | null;
  similarity: number;
}

export async function retrieveChunks(
  documentId: string,
  query: string,
  topK: number = 5,
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await generateEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(',')}]`;

  const results = await prisma.$queryRawUnsafe<
    {
      id: string;
      chunk_index: number;
      content: string;
      page_number: number | null;
      section: string | null;
      similarity: number;
    }[]
  >(
    `SELECT id, chunk_index, content, page_number, section,
            1 - (embedding <=> $1::vector) as similarity
     FROM document_chunks
     WHERE document_id = $2::uuid
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    vectorStr,
    documentId,
    topK,
  );

  return results.map((r) => ({
    id: r.id,
    chunkIndex: r.chunk_index,
    content: r.content,
    pageNumber: r.page_number,
    section: r.section,
    similarity: Number(r.similarity),
  }));
}
