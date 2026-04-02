import { generateEmbedding } from '../gigachat/embeddings.js';
import { searchSimilar } from '../storage/vector.js';
import { getDb } from '../storage/sqlite.js';

export interface SemanticResult {
  chunkId: string;
  content: string;
  score: number;
  sourceType: string;
  chunkType: string;
  documentTitle?: string;
  serviceName?: string;
  metadata?: Record<string, unknown>;
}

export async function semanticSearch(query: string, topK = 10): Promise<SemanticResult[]> {
  const queryVector = await generateEmbedding(query);
  const similar = searchSimilar(queryVector, topK);

  if (similar.length === 0) return [];

  const db = getDb();
  const placeholders = similar.map(() => '?').join(',');
  const chunkIds = similar.map(s => s.chunkId);

  const chunks = db.prepare(`
    SELECT c.id, c.content, c.source_type, c.chunk_type, c.metadata,
           d.title as doc_title,
           s.name as service_name
    FROM chunks c
    LEFT JOIN documents d ON c.document_id = d.id
    LEFT JOIN services s ON c.service_id = s.id
    WHERE c.id IN (${placeholders})
  `).all(...chunkIds) as Array<{
    id: string;
    content: string;
    source_type: string;
    chunk_type: string;
    metadata: string | null;
    doc_title: string | null;
    service_name: string | null;
  }>;

  const chunkMap = new Map(chunks.map(c => [c.id, c]));

  return similar.map(s => {
    const chunk = chunkMap.get(s.chunkId);
    return {
      chunkId: s.chunkId,
      content: chunk?.content || '',
      score: s.score,
      sourceType: chunk?.source_type || '',
      chunkType: chunk?.chunk_type || '',
      documentTitle: chunk?.doc_title || undefined,
      serviceName: chunk?.service_name || undefined,
      metadata: chunk?.metadata ? JSON.parse(chunk.metadata) : undefined,
    };
  });
}
