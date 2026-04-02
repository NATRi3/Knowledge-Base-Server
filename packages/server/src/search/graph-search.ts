import { getGraph, type NodeAttributes, type EdgeAttributes } from '../storage/graph.js';

export interface GraphSearchResult {
  nodes: Array<{ id: string } & NodeAttributes>;
  edges: Array<{ source: string; target: string } & EdgeAttributes>;
  paths?: string[][];
}

/**
 * Find neighbors of a node up to a certain depth.
 */
export function findNeighbors(nodeId: string, maxDepth = 2): GraphSearchResult {
  const graph = getGraph();
  if (!graph.hasNode(nodeId)) return { nodes: [], edges: [] };

  const visited = new Set<string>();
  const resultEdges: Array<{ source: string; target: string } & EdgeAttributes> = [];
  const queue: Array<{ node: string; depth: number }> = [{ node: nodeId, depth: 0 }];
  visited.add(nodeId);

  while (queue.length > 0) {
    const { node, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    graph.forEachEdge(node, (edge, attrs, source, target) => {
      resultEdges.push({ source, target, ...attrs });
      const neighbor = source === node ? target : source;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ node: neighbor, depth: depth + 1 });
      }
    });
  }

  const nodes = Array.from(visited)
    .filter(id => graph.hasNode(id))
    .map(id => ({ id, ...graph.getNodeAttributes(id) }));

  return { nodes, edges: resultEdges };
}

/**
 * Find all services that depend on a given service.
 */
export function findDependents(serviceNodeId: string): GraphSearchResult {
  const graph = getGraph();
  if (!graph.hasNode(serviceNodeId)) return { nodes: [], edges: [] };

  const dependents = new Set<string>();
  const resultEdges: Array<{ source: string; target: string } & EdgeAttributes> = [];

  graph.forEachInEdge(serviceNodeId, (edge, attrs, source) => {
    if (attrs.type === 'DEPENDS_ON' || attrs.type === 'INTEGRATES_WITH') {
      dependents.add(source);
      resultEdges.push({ source, target: serviceNodeId, ...attrs });
    }
  });

  const nodes = [
    { id: serviceNodeId, ...graph.getNodeAttributes(serviceNodeId) },
    ...Array.from(dependents).map(id => ({ id, ...graph.getNodeAttributes(id) })),
  ];

  return { nodes, edges: resultEdges };
}

/**
 * Find all services that a given service depends on.
 */
export function findDependencies(serviceNodeId: string): GraphSearchResult {
  const graph = getGraph();
  if (!graph.hasNode(serviceNodeId)) return { nodes: [], edges: [] };

  const dependencies = new Set<string>();
  const resultEdges: Array<{ source: string; target: string } & EdgeAttributes> = [];

  graph.forEachOutEdge(serviceNodeId, (edge, attrs, _source, target) => {
    if (attrs.type === 'DEPENDS_ON' || attrs.type === 'INTEGRATES_WITH') {
      dependencies.add(target);
      resultEdges.push({ source: serviceNodeId, target, ...attrs });
    }
  });

  const nodes = [
    { id: serviceNodeId, ...graph.getNodeAttributes(serviceNodeId) },
    ...Array.from(dependencies).map(id => ({ id, ...graph.getNodeAttributes(id) })),
  ];

  return { nodes, edges: resultEdges };
}

/**
 * Search graph nodes by label (fuzzy match).
 */
export function searchNodes(query: string, nodeType?: string): Array<{ id: string } & NodeAttributes> {
  const graph = getGraph();
  const lowerQuery = query.toLowerCase();
  const results: Array<{ id: string } & NodeAttributes> = [];

  graph.forEachNode((id, attrs) => {
    if (nodeType && attrs.type !== nodeType) return;
    if (attrs.label.toLowerCase().includes(lowerQuery)) {
      results.push({ id, ...attrs });
    }
  });

  return results;
}
