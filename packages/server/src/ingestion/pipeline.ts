import { v4 as uuid } from 'uuid';
import { getDb } from '../storage/sqlite.js';
import { persistGraph } from '../storage/graph.js';
import { config } from '../config.js';
import { ingestSwagger } from './swagger.js';
import { ingestConfluence } from './confluence.js';
import { ingestJira } from './jira.js';

export interface IngestionStatus {
  id: string;
  source: string;
  sourceUrl?: string;
  status: 'running' | 'completed' | 'failed';
  itemsProcessed: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

function logStart(source: string, sourceUrl?: string): string {
  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO ingestion_log (id, source, source_url, status)
    VALUES (?, ?, ?, 'running')
  `).run(id, source, sourceUrl || '');
  return id;
}

function logComplete(id: string, itemsProcessed: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE ingestion_log SET status = 'completed', items_processed = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(itemsProcessed, id);
}

function logFailed(id: string, error: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE ingestion_log SET status = 'failed', error = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(error, id);
}

export async function runFullIngestion(): Promise<IngestionStatus[]> {
  const results: IngestionStatus[] = [];

  // Ingest Swagger specs
  for (const url of config.swaggerUrls) {
    const logId = logStart('swagger', url);
    try {
      const result = await ingestSwagger(url);
      logComplete(logId, result.endpointsCount);
      results.push({
        id: logId, source: 'swagger', sourceUrl: url,
        status: 'completed', itemsProcessed: result.endpointsCount,
        startedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logFailed(logId, msg);
      results.push({
        id: logId, source: 'swagger', sourceUrl: url,
        status: 'failed', itemsProcessed: 0, error: msg,
        startedAt: new Date().toISOString(),
      });
    }
  }

  // Ingest Confluence spaces
  for (const space of config.confluence.spaces) {
    const logId = logStart('confluence', space);
    try {
      const result = await ingestConfluence(space);
      logComplete(logId, result.pagesProcessed);
      results.push({
        id: logId, source: 'confluence', sourceUrl: space,
        status: 'completed', itemsProcessed: result.pagesProcessed,
        startedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logFailed(logId, msg);
      results.push({
        id: logId, source: 'confluence', sourceUrl: space,
        status: 'failed', itemsProcessed: 0, error: msg,
        startedAt: new Date().toISOString(),
      });
    }
  }

  // Ingest Jira projects
  for (const project of config.jira.projectKeys) {
    const logId = logStart('jira', project);
    try {
      const result = await ingestJira(project);
      logComplete(logId, result.ticketsProcessed);
      results.push({
        id: logId, source: 'jira', sourceUrl: project,
        status: 'completed', itemsProcessed: result.ticketsProcessed,
        startedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logFailed(logId, msg);
      results.push({
        id: logId, source: 'jira', sourceUrl: project,
        status: 'failed', itemsProcessed: 0, error: msg,
        startedAt: new Date().toISOString(),
      });
    }
  }

  // Persist graph after full ingestion
  persistGraph();

  return results;
}

export function getIngestionHistory(limit = 50): IngestionStatus[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, source, source_url as sourceUrl, status, items_processed as itemsProcessed,
           error, started_at as startedAt, completed_at as completedAt
    FROM ingestion_log ORDER BY started_at DESC LIMIT ?
  `).all(limit) as IngestionStatus[];
}
