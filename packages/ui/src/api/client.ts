const BASE_URL = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || res.statusText);
  }
  return res.json();
}

// Stats
export interface Stats {
  services: number;
  endpoints: number;
  documents: number;
  chunks: number;
  embeddings: number;
  tickets: number;
  graphNodes: number;
  graphEdges: number;
}
export const getStats = () => request<Stats>('/stats');

// Services
export interface Service {
  id: string;
  name: string;
  description: string;
  swagger_url: string;
  source: string;
  endpoints_count?: number;
  docs_count?: number;
  tickets_count?: number;
}
export const getServices = () => request<{ services: Service[] }>('/services');
export const getService = (id: string) => request<{ service: Service; endpoints: any[]; graph: GraphData }>(`/services/${id}`);

// Graph
export interface GraphNode {
  id: string;
  type: string;
  label: string;
  size?: number;
  color?: string;
  x?: number;
  y?: number;
  data?: Record<string, unknown>;
}
export interface GraphEdge {
  id?: string;
  source: string;
  target: string;
  type: string;
  label?: string;
}
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export const getGraph = () => request<GraphData>('/graph');
export const getServiceGraph = (serviceId: string) => request<GraphData>(`/graph/service/${serviceId}`);
export const getNeighbors = (nodeId: string, depth?: number) =>
  request<GraphData>(`/graph/neighbors/${encodeURIComponent(nodeId)}?depth=${depth || 2}`);

// Search
export interface SearchResult {
  type: string;
  content: string;
  title?: string;
  score: number;
  sourceType: string;
  nodeId?: string;
  metadata?: Record<string, unknown>;
}
export const search = (query: string, topK?: number) =>
  request<{ intent: string; results: SearchResult[] }>(`/search?q=${encodeURIComponent(query)}&topK=${topK || 15}`);

// Ingestion
export const triggerIngestion = () => request<{ message: string }>('/ingest/trigger', { method: 'POST' });
export const getIngestionHistory = () => request<{ history: any[] }>('/ingest/history');
