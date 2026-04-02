import Graph from 'graphology';
import { getDb } from './sqlite.js';

// Node types
export type NodeType = 'service' | 'endpoint' | 'document' | 'schema' | 'ticket' | 'team' | 'technology';

// Edge types
export type EdgeType =
  | 'EXPOSES'           // service -> endpoint
  | 'DEPENDS_ON'        // service -> service
  | 'INTEGRATES_WITH'   // service -> service (via specific endpoint)
  | 'DOCUMENTED_BY'     // service/endpoint -> document
  | 'REFERENCES'        // document -> document
  | 'USES_SCHEMA'       // endpoint -> schema
  | 'AFFECTS'           // ticket -> service
  | 'BELONGS_TO'        // service -> team
  | 'USES_TECHNOLOGY'   // service -> technology
  | 'BLOCKS'            // ticket -> ticket
  | 'RELATES_TO'        // ticket -> ticket
  | 'CHILD_OF';         // ticket -> ticket (epic->story->subtask)

export interface NodeAttributes {
  type: NodeType;
  label: string;
  data?: Record<string, unknown>;
  // For visualization
  size?: number;
  color?: string;
  x?: number;
  y?: number;
}

export interface EdgeAttributes {
  type: EdgeType;
  label?: string;
  weight?: number;
  data?: Record<string, unknown>;
}

// Color palette for node types
const NODE_COLORS: Record<NodeType, string> = {
  service: '#4F46E5',     // indigo
  endpoint: '#059669',    // emerald
  document: '#D97706',    // amber
  schema: '#7C3AED',      // violet
  ticket: '#DC2626',      // red
  team: '#2563EB',        // blue
  technology: '#0891B2',  // cyan
};

const NODE_SIZES: Record<NodeType, number> = {
  service: 15,
  endpoint: 6,
  document: 8,
  schema: 5,
  ticket: 7,
  team: 12,
  technology: 10,
};

let graph: Graph<NodeAttributes, EdgeAttributes>;

export function getGraph(): Graph<NodeAttributes, EdgeAttributes> {
  if (!graph) {
    graph = new Graph<NodeAttributes, EdgeAttributes>({ multi: true, type: 'directed' });
    restoreGraph();
  }
  return graph;
}

export function addNode(id: string, type: NodeType, label: string, data?: Record<string, unknown>): void {
  const g = getGraph();
  if (g.hasNode(id)) {
    g.mergeNodeAttributes(id, { label, data });
    return;
  }
  g.addNode(id, {
    type,
    label,
    data,
    size: NODE_SIZES[type],
    color: NODE_COLORS[type],
  });
}

export function addEdge(source: string, target: string, type: EdgeType, data?: Record<string, unknown>): void {
  const g = getGraph();
  if (!g.hasNode(source) || !g.hasNode(target)) return;

  // Check if same edge already exists
  const existing = g.edges(source, target).find(e => {
    const attrs = g.getEdgeAttributes(e);
    return attrs.type === type;
  });

  if (existing) {
    if (data) g.mergeEdgeAttributes(existing, { data });
    return;
  }

  g.addEdge(source, target, {
    type,
    label: type,
    weight: 1,
    data,
  });
}

export function getServiceSubgraph(serviceId: string): {
  nodes: Array<{ id: string } & NodeAttributes>;
  edges: Array<{ source: string; target: string } & EdgeAttributes>;
} {
  const g = getGraph();
  if (!g.hasNode(serviceId)) {
    return { nodes: [], edges: [] };
  }

  const visitedNodes = new Set<string>();
  const resultEdges: Array<{ source: string; target: string } & EdgeAttributes> = [];

  // BFS 2 levels deep from service node
  const queue: Array<{ node: string; depth: number }> = [{ node: serviceId, depth: 0 }];
  visitedNodes.add(serviceId);

  while (queue.length > 0) {
    const { node, depth } = queue.shift()!;
    if (depth >= 2) continue;

    g.forEachEdge(node, (edge, attrs, source, target) => {
      resultEdges.push({ source, target, ...attrs });
      const neighbor = source === node ? target : source;
      if (!visitedNodes.has(neighbor)) {
        visitedNodes.add(neighbor);
        queue.push({ node: neighbor, depth: depth + 1 });
      }
    });
  }

  const resultNodes = Array.from(visitedNodes).map(id => ({
    id,
    ...g.getNodeAttributes(id),
  }));

  return { nodes: resultNodes, edges: resultEdges };
}

export function getFullGraph(): {
  nodes: Array<{ id: string } & NodeAttributes>;
  edges: Array<{ id: string; source: string; target: string } & EdgeAttributes>;
} {
  const g = getGraph();
  const nodes = g.mapNodes((id, attrs) => ({ id, ...attrs }));
  const edges = g.mapEdges((id, attrs, source, target) => ({ id, source, target, ...attrs }));
  return { nodes, edges };
}

// Persistence

export function persistGraph(): void {
  const g = getGraph();
  const serialized = g.export();
  const db = getDb();
  db.prepare('DELETE FROM graph_snapshots').run();
  db.prepare('INSERT INTO graph_snapshots (graph_data) VALUES (?)').run(JSON.stringify(serialized));
}

function restoreGraph(): void {
  const db = getDb();
  const row = db.prepare('SELECT graph_data FROM graph_snapshots ORDER BY id DESC LIMIT 1').get() as
    | { graph_data: string }
    | undefined;

  if (row) {
    try {
      const data = JSON.parse(row.graph_data);
      graph.import(data);
    } catch {
      // Start fresh if corrupted
    }
  }
}

// Auto-persist interval
let persistInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoPersist(intervalMs = 30_000): void {
  if (persistInterval) return;
  persistInterval = setInterval(() => {
    persistGraph();
  }, intervalMs);
}

export function stopAutoPersist(): void {
  if (persistInterval) {
    clearInterval(persistInterval);
    persistInterval = null;
  }
}
