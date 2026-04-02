import { semanticSearch, type SemanticResult } from './semantic.js';
import { searchNodes, findNeighbors } from './graph-search.js';
import { routeQuery } from '../classifier/router.js';
import { getDb } from '../storage/sqlite.js';

export interface HybridResult {
  type: 'semantic' | 'graph' | 'sql';
  content: string;
  title?: string;
  score: number;
  sourceType: string;
  nodeId?: string;
  metadata?: Record<string, unknown>;
}

export async function hybridSearch(
  query: string,
  options: { topK?: number; useRouter?: boolean } = {}
): Promise<{
  intent: string;
  results: HybridResult[];
}> {
  const { topK = 15, useRouter = true } = options;

  let strategies = ['vector', 'graph'];
  let intent = 'factual';

  // Use GigaChat router if enabled
  if (useRouter) {
    try {
      const route = await routeQuery(query);
      strategies = route.strategies;
      intent = route.intent;
    } catch {
      // Fallback to default
    }
  }

  const allResults: HybridResult[] = [];

  // Vector search
  if (strategies.includes('vector') || strategies.includes('hybrid')) {
    const semanticResults = await semanticSearch(query, topK);
    for (const r of semanticResults) {
      allResults.push({
        type: 'semantic',
        content: r.content,
        title: r.documentTitle || r.serviceName,
        score: r.score,
        sourceType: r.sourceType,
        metadata: r.metadata,
      });
    }
  }

  // Graph search
  if (strategies.includes('graph') || strategies.includes('hybrid')) {
    const graphNodes = searchNodes(query);
    for (const node of graphNodes.slice(0, topK)) {
      // Get context from neighbors
      const neighbors = findNeighbors(node.id, 1);
      const neighborLabels = neighbors.nodes
        .filter(n => n.id !== node.id)
        .map(n => `${n.type}: ${n.label}`)
        .slice(0, 5);

      allResults.push({
        type: 'graph',
        content: neighborLabels.length > 0
          ? `${node.label}\nConnected to: ${neighborLabels.join(', ')}`
          : node.label,
        title: node.label,
        score: 0.8, // Base score for exact graph matches
        sourceType: node.type,
        nodeId: node.id,
        metadata: node.data,
      });
    }
  }

  // SQL search (for aggregation queries)
  if (strategies.includes('sql')) {
    const sqlResults = sqlSearch(query);
    allResults.push(...sqlResults);
  }

  // Deduplicate and sort by score
  const seen = new Set<string>();
  const deduped = allResults.filter(r => {
    const key = `${r.type}:${r.content.slice(0, 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => b.score - a.score);

  return {
    intent,
    results: deduped.slice(0, topK),
  };
}

/**
 * Simple SQL-based search for structured data queries.
 */
function sqlSearch(query: string): HybridResult[] {
  const db = getDb();
  const results: HybridResult[] = [];
  const lowerQuery = query.toLowerCase();

  // Search services
  const services = db.prepare(`
    SELECT name, description FROM services
    WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ?
  `).all(`%${lowerQuery}%`, `%${lowerQuery}%`) as Array<{ name: string; description: string }>;

  for (const svc of services) {
    results.push({
      type: 'sql',
      content: `Service: ${svc.name}\n${svc.description}`,
      title: svc.name,
      score: 0.7,
      sourceType: 'service',
    });
  }

  // Search endpoints
  const endpoints = db.prepare(`
    SELECT e.path, e.method, e.summary, s.name as service_name
    FROM api_endpoints e
    JOIN services s ON e.service_id = s.id
    WHERE LOWER(e.path) LIKE ? OR LOWER(e.summary) LIKE ?
    LIMIT 20
  `).all(`%${lowerQuery}%`, `%${lowerQuery}%`) as Array<{
    path: string; method: string; summary: string; service_name: string;
  }>;

  for (const ep of endpoints) {
    results.push({
      type: 'sql',
      content: `${ep.method} ${ep.path} (${ep.service_name})\n${ep.summary}`,
      title: `${ep.method} ${ep.path}`,
      score: 0.65,
      sourceType: 'endpoint',
    });
  }

  return results;
}
