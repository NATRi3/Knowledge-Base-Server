import { Router, type Request, type Response } from 'express';
import { hybridSearch } from '../search/hybrid.js';
import { getFullGraph, getServiceSubgraph } from '../storage/graph.js';
import { findNeighbors, findDependents, findDependencies, searchNodes } from '../search/graph-search.js';
import { getDb } from '../storage/sqlite.js';
import { getEmbeddingCount } from '../storage/vector.js';
import { runFullIngestion, getIngestionHistory } from '../ingestion/pipeline.js';

export const router = Router();

// === Search ===

router.get('/api/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) return res.status(400).json({ error: 'Query parameter "q" is required' });

    const topK = parseInt(req.query.topK as string) || 10;
    const useRouter = req.query.router !== 'false';

    const results = await hybridSearch(query, { topK, useRouter });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Search failed' });
  }
});

// === Graph ===

router.get('/api/graph', (_req: Request, res: Response) => {
  try {
    const graph = getFullGraph();
    res.json(graph);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get graph' });
  }
});

router.get('/api/graph/service/:serviceId', (req: Request, res: Response) => {
  try {
    const { serviceId } = req.params;
    const subgraph = getServiceSubgraph(`service:${serviceId}`);
    res.json(subgraph);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get service graph' });
  }
});

router.get('/api/graph/neighbors/:nodeId', (req: Request, res: Response) => {
  try {
    const nodeId = decodeURIComponent(req.params.nodeId);
    const depth = parseInt(req.query.depth as string) || 2;
    const result = findNeighbors(nodeId, depth);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.get('/api/graph/dependents/:serviceId', (req: Request, res: Response) => {
  try {
    const result = findDependents(`service:${req.params.serviceId}`);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.get('/api/graph/dependencies/:serviceId', (req: Request, res: Response) => {
  try {
    const result = findDependencies(`service:${req.params.serviceId}`);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.get('/api/graph/search', (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const nodeType = req.query.type as string | undefined;
    if (!query) return res.status(400).json({ error: 'Query "q" is required' });
    const nodes = searchNodes(query, nodeType);
    res.json({ nodes });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

// === Services ===

router.get('/api/services', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const services = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM api_endpoints WHERE service_id = s.id) as endpoints_count,
        (SELECT COUNT(*) FROM documents WHERE id IN (
          SELECT document_id FROM chunks WHERE service_id = s.id
        )) as docs_count,
        (SELECT COUNT(*) FROM jira_tickets WHERE service_id = s.id) as tickets_count
      FROM services s ORDER BY s.name
    `).all();
    res.json({ services });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.get('/api/services/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const endpoints = db.prepare('SELECT * FROM api_endpoints WHERE service_id = ?').all(req.params.id);
    const subgraph = getServiceSubgraph(`service:${req.params.id}`);

    res.json({ service, endpoints, graph: subgraph });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

// === Ingestion ===

router.post('/api/ingest/trigger', async (_req: Request, res: Response) => {
  try {
    res.json({ message: 'Ingestion started', status: 'running' });
    // Run ingestion in background
    runFullIngestion().catch(err => {
      console.error('Ingestion failed:', err);
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.post('/api/ingest/run', async (_req: Request, res: Response) => {
  try {
    const results = await runFullIngestion();
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.get('/api/ingest/history', (_req: Request, res: Response) => {
  try {
    const history = getIngestionHistory();
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

// === Stats ===

router.get('/api/stats', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const services = (db.prepare('SELECT COUNT(*) as count FROM services').get() as { count: number }).count;
    const endpoints = (db.prepare('SELECT COUNT(*) as count FROM api_endpoints').get() as { count: number }).count;
    const documents = (db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number }).count;
    const chunks = (db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number }).count;
    const embeddings = getEmbeddingCount();
    const tickets = (db.prepare('SELECT COUNT(*) as count FROM jira_tickets').get() as { count: number }).count;

    const graph = getFullGraph();

    res.json({
      services,
      endpoints,
      documents,
      chunks,
      embeddings,
      tickets,
      graphNodes: graph.nodes.length,
      graphEdges: graph.edges.length,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});
