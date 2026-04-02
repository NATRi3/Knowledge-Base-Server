import SwaggerParser from '@apidevtools/swagger-parser';
import { v4 as uuid } from 'uuid';
import { getDb } from '../storage/sqlite.js';
import { addNode, addEdge } from '../storage/graph.js';
import { generateEmbeddings } from '../gigachat/embeddings.js';
import { storeEmbeddings } from '../storage/vector.js';

interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info: { title: string; description?: string; version: string };
  paths?: Record<string, Record<string, PathItem>>;
  components?: { schemas?: Record<string, unknown> };
}

interface PathItem {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
}

export async function ingestSwagger(url: string): Promise<{
  serviceId: string;
  endpointsCount: number;
}> {
  const spec = (await SwaggerParser.parse(url)) as unknown as OpenAPISpec;
  const db = getDb();

  // Extract service name from spec title
  const serviceName = spec.info.title
    .toLowerCase()
    .replace(/\s+api$/i, '')
    .replace(/\s+/g, '-');

  // Upsert service
  const serviceId = uuid();
  db.prepare(`
    INSERT INTO services (id, name, description, swagger_url, source)
    VALUES (?, ?, ?, ?, 'swagger')
    ON CONFLICT(name) DO UPDATE SET
      description = excluded.description,
      swagger_url = excluded.swagger_url,
      updated_at = datetime('now')
  `).run(serviceId, serviceName, spec.info.description || '', url);

  // Get the actual service ID (might exist already)
  const svc = db.prepare('SELECT id FROM services WHERE name = ?').get(serviceName) as { id: string };
  const actualServiceId = svc.id;

  // Add service node to graph
  addNode(`service:${actualServiceId}`, 'service', serviceName, {
    version: spec.info.version,
    swaggerUrl: url,
  });

  // Process endpoints
  const chunksToEmbed: Array<{ chunkId: string; text: string }> = [];
  let endpointsCount = 0;

  const insertEndpoint = db.prepare(`
    INSERT INTO api_endpoints (id, service_id, path, method, summary, description, operation_id, tags, parameters, request_body, responses)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(service_id, path, method) DO UPDATE SET
      summary = excluded.summary,
      description = excluded.description
  `);

  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, service_id, endpoint_id, content, chunk_index, chunk_type, source_type)
    VALUES (?, ?, ?, ?, ?, 'endpoint', 'swagger')
  `);

  const tx = db.transaction(() => {
    for (const [path, methods] of Object.entries(spec.paths || {})) {
      for (const [method, item] of Object.entries(methods)) {
        if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].indexOf(method) === -1) continue;

        const endpointId = uuid();
        const chunkId = uuid();
        const upperMethod = method.toUpperCase();

        insertEndpoint.run(
          endpointId,
          actualServiceId,
          path,
          upperMethod,
          item.summary || '',
          item.description || '',
          item.operationId || '',
          JSON.stringify(item.tags || []),
          JSON.stringify(item.parameters || []),
          JSON.stringify(item.requestBody || null),
          JSON.stringify(item.responses || {})
        );

        // Build text for embedding
        const embeddingText = [
          `${upperMethod} ${path}`,
          item.summary || '',
          item.description || '',
          item.tags ? `Tags: ${item.tags.join(', ')}` : '',
        ].filter(Boolean).join('\n');

        insertChunk.run(chunkId, actualServiceId, endpointId, embeddingText, endpointsCount);
        chunksToEmbed.push({ chunkId, text: embeddingText });

        // Graph: service -> endpoint
        const endpointNodeId = `endpoint:${endpointId}`;
        addNode(endpointNodeId, 'endpoint', `${upperMethod} ${path}`, {
          method: upperMethod,
          path,
          summary: item.summary,
          tags: item.tags,
        });
        addEdge(`service:${actualServiceId}`, endpointNodeId, 'EXPOSES');

        endpointsCount++;
      }
    }
  });

  tx();

  // Process schemas
  if (spec.components?.schemas) {
    for (const [schemaName] of Object.entries(spec.components.schemas)) {
      const schemaNodeId = `schema:${actualServiceId}:${schemaName}`;
      addNode(schemaNodeId, 'schema', schemaName, { service: serviceName });
      addEdge(`service:${actualServiceId}`, schemaNodeId, 'USES_SCHEMA');
    }
  }

  // Generate embeddings in batches
  if (chunksToEmbed.length > 0) {
    const texts = chunksToEmbed.map(c => c.text);
    const vectors = await generateEmbeddings(texts);
    storeEmbeddings(
      chunksToEmbed.map((c, i) => ({ chunkId: c.chunkId, vector: vectors[i] }))
    );
  }

  return { serviceId: actualServiceId, endpointsCount };
}
