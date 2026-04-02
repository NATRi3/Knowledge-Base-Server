import { getDb } from './sqlite.js';
import { v4 as uuid } from 'uuid';

/**
 * Store an embedding vector for a chunk.
 */
export function storeEmbedding(chunkId: string, vector: number[], model: string = 'Embeddings'): string {
  const db = getDb();
  const id = uuid();
  const buffer = Buffer.from(new Float32Array(vector).buffer);

  db.prepare(`
    INSERT OR REPLACE INTO embeddings (id, chunk_id, vector, model, dimensions)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, chunkId, buffer, model, vector.length);

  return id;
}

/**
 * Store multiple embeddings in a transaction.
 */
export function storeEmbeddings(
  items: Array<{ chunkId: string; vector: number[] }>,
  model: string = 'Embeddings'
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO embeddings (id, chunk_id, vector, model, dimensions)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const { chunkId, vector } of items) {
      const buffer = Buffer.from(new Float32Array(vector).buffer);
      stmt.run(uuid(), chunkId, buffer, model, vector.length);
    }
  });

  tx();
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

interface SearchResult {
  chunkId: string;
  score: number;
}

/**
 * Search for the most similar chunks to a query vector.
 * Brute-force scan — works well for <100K vectors.
 */
export function searchSimilar(queryVector: number[], topK: number = 10, minScore: number = 0.3): SearchResult[] {
  const db = getDb();
  const rows = db.prepare('SELECT chunk_id, vector FROM embeddings').all() as Array<{
    chunk_id: string;
    vector: Buffer;
  }>;

  const queryArr = new Float32Array(queryVector);
  const scored: SearchResult[] = [];

  for (const row of rows) {
    const stored = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4);
    const score = cosineSimilarity(queryArr, stored);
    if (score >= minScore) {
      scored.push({ chunkId: row.chunk_id, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Get embedding count for stats.
 */
export function getEmbeddingCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as { count: number };
  return row.count;
}
