import { v4 as uuid } from 'uuid';
import { config } from '../config.js';
import { getDb } from '../storage/sqlite.js';
import { addNode, addEdge } from '../storage/graph.js';
import { classifyContent } from '../classifier/content-classifier.js';
import { extractEntities } from '../classifier/entity-extractor.js';
import { generateEmbeddings } from '../gigachat/embeddings.js';
import { storeEmbeddings } from '../storage/vector.js';

interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  body?: { storage?: { value: string } };
  _links?: { webui?: string };
  spaceId?: string;
  version?: { number: number; createdAt: string };
}

interface PagesResponse {
  results: ConfluencePage[];
  _links?: { next?: string };
}

/**
 * Strip HTML tags and convert to plain text.
 * Simple approach — turndown could be used for richer conversion.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chunk text into pieces. Page-level by default, semantic split for large pages.
 */
function chunkText(text: string, maxChunkSize = 2000): string[] {
  if (text.length <= maxChunkSize) return [text];

  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      // 15% overlap
      const overlapSize = Math.floor(current.length * 0.15);
      current = current.slice(-overlapSize) + ' ' + sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

async function fetchPages(spaceKey: string): Promise<ConfluencePage[]> {
  const { url, token } = config.confluence;
  const allPages: ConfluencePage[] = [];
  let nextUrl: string | null = `${url}/wiki/api/v2/spaces?keys=${spaceKey}`;

  // First get space ID
  const spaceResp = await fetch(nextUrl, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });
  if (!spaceResp.ok) throw new Error(`Failed to fetch space ${spaceKey}: ${spaceResp.status}`);
  const spaceData = await spaceResp.json() as { results: Array<{ id: string }> };
  if (!spaceData.results.length) throw new Error(`Space ${spaceKey} not found`);
  const spaceId = spaceData.results[0].id;

  // Fetch pages
  nextUrl = `${url}/wiki/api/v2/spaces/${spaceId}/pages?limit=50&body-format=storage`;

  while (nextUrl) {
    const resp = await fetch(nextUrl, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    if (!resp.ok) throw new Error(`Failed to fetch pages: ${resp.status}`);
    const data = (await resp.json()) as PagesResponse;
    allPages.push(...data.results);
    nextUrl = data._links?.next ? `${url}${data._links.next}` : null;
  }

  return allPages;
}

export async function ingestConfluence(spaceKey: string): Promise<{
  pagesProcessed: number;
  chunksCreated: number;
}> {
  const pages = await fetchPages(spaceKey);
  const db = getDb();
  let chunksCreated = 0;

  const insertDoc = db.prepare(`
    INSERT INTO documents (id, title, source, source_id, source_url, content, content_type, space, structuredness, relationship_density)
    VALUES (?, ?, 'confluence', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `);

  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, document_id, content, chunk_index, chunk_type, source_type)
    VALUES (?, ?, ?, ?, ?, 'confluence')
  `);

  for (const page of pages) {
    const html = page.body?.storage?.value || '';
    const text = htmlToText(html);
    if (!text || text.length < 50) continue;

    const docId = uuid();
    const pageUrl = page._links?.webui
      ? `${config.confluence.url}/wiki${page._links.webui}`
      : '';

    // Classify content
    const classification = await classifyContent(page.title, text, 'confluence');

    insertDoc.run(
      docId,
      page.title,
      page.id,
      pageUrl,
      text,
      classification.documentType,
      spaceKey,
      classification.structuredness,
      classification.relationshipDensity
    );

    // Add document node to graph
    const docNodeId = `doc:${docId}`;
    addNode(docNodeId, 'document', page.title, {
      source: 'confluence',
      space: spaceKey,
      contentType: classification.documentType,
      url: pageUrl,
    });

    // Extract entities and build graph relationships
    if (classification.storageRoute.includes('graph')) {
      const entities = await extractEntities(page.title, text);

      for (const svc of entities.services) {
        const svcNodeId = `service:name:${svc.name.toLowerCase().replace(/\s+/g, '-')}`;
        addNode(svcNodeId, 'service', svc.name, { description: svc.description });
        addEdge(svcNodeId, docNodeId, 'DOCUMENTED_BY');
      }

      for (const tech of entities.technologies) {
        const techNodeId = `tech:${tech.name.toLowerCase()}`;
        addNode(techNodeId, 'technology', tech.name, { category: tech.category });
      }

      for (const rel of entities.relationships) {
        const sourceNodeId = `service:name:${rel.source.toLowerCase().replace(/\s+/g, '-')}`;
        const targetNodeId = `service:name:${rel.target.toLowerCase().replace(/\s+/g, '-')}`;
        addEdge(sourceNodeId, targetNodeId, rel.type as any);
      }
    }

    // Chunk and embed
    const chunks = chunkText(text);
    const chunkIds: string[] = [];
    const chunkTexts: string[] = [];

    const chunkTx = db.transaction(() => {
      chunks.forEach((chunk, index) => {
        const chunkId = uuid();
        const chunkType = chunks.length === 1 ? 'page' : 'semantic';
        insertChunk.run(chunkId, docId, chunk, index, chunkType);
        chunkIds.push(chunkId);
        chunkTexts.push(`${page.title}\n\n${chunk}`);
        chunksCreated++;
      });
    });
    chunkTx();

    // Generate embeddings
    if (chunkTexts.length > 0) {
      const vectors = await generateEmbeddings(chunkTexts);
      storeEmbeddings(
        chunkIds.map((id, i) => ({ chunkId: id, vector: vectors[i] }))
      );
    }
  }

  return { pagesProcessed: pages.length, chunksCreated };
}
