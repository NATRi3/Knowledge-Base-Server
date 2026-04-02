import { config } from '../config.js';
import { getAccessToken } from './auth.js';

interface EmbeddingData {
  object: string;
  embedding: number[];
  index: number;
}

interface EmbeddingsResponse {
  object: string;
  data: EmbeddingData[];
  model: string;
}

/**
 * Generate embeddings for an array of texts using GigaChat API.
 * Batches are handled automatically (max ~50 texts per request recommended).
 */
export async function generateEmbeddings(
  texts: string[],
  model: string = 'Embeddings'
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const token = await getAccessToken();
  const batchSize = 50;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await fetch(`${config.gigachat.apiUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: batch,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GigaChat embeddings failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as EmbeddingsResponse;

    // Sort by index to maintain order
    const sorted = data.data.sort((a, b) => a.index - b.index);
    allEmbeddings.push(...sorted.map(d => d.embedding));
  }

  return allEmbeddings;
}

/**
 * Generate embedding for a single text.
 */
export async function generateEmbedding(text: string, model?: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text], model);
  return embedding;
}
