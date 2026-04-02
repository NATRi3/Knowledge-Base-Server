import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const KB_URL = process.env.KB_URL || 'http://localhost:3000';

async function kbRequest<T>(path: string): Promise<T> {
  const res = await fetch(`${KB_URL}/api${path}`);
  if (!res.ok) throw new Error(`KB API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function kbPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${KB_URL}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`KB API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

const server = new McpServer({
  name: 'enterprise-knowledge-base',
  version: '1.0.0',
});

// Tool: search_knowledge
server.tool(
  'search_knowledge',
  'Search the enterprise knowledge base using semantic search across services, documentation, API specs, and Jira tickets',
  {
    query: z.string().describe('Search query text'),
    topK: z.number().optional().describe('Number of results to return (default 10)'),
  },
  async ({ query, topK }) => {
    const data = await kbRequest<{
      intent: string;
      results: Array<{
        type: string;
        content: string;
        title?: string;
        score: number;
        sourceType: string;
      }>;
    }>(`/search?q=${encodeURIComponent(query)}&topK=${topK || 10}`);

    const text = data.results
      .map((r, i) => {
        const header = r.title ? `**${r.title}**` : `Result ${i + 1}`;
        return `### ${header}\n- Source: ${r.sourceType} (${r.type})\n- Relevance: ${(r.score * 100).toFixed(1)}%\n\n${r.content}`;
      })
      .join('\n\n---\n\n');

    return {
      content: [{
        type: 'text' as const,
        text: `**Query intent:** ${data.intent}\n**Results:** ${data.results.length}\n\n${text}`,
      }],
    };
  }
);

// Tool: get_service_info
server.tool(
  'get_service_info',
  'Get detailed information about a specific service including its endpoints, documentation, and graph connections',
  {
    serviceId: z.string().describe('Service ID'),
  },
  async ({ serviceId }) => {
    const data = await kbRequest<{
      service: { name: string; description: string; swagger_url: string };
      endpoints: Array<{ method: string; path: string; summary: string }>;
      graph: { nodes: Array<{ id: string; type: string; label: string }>; edges: Array<{ type: string; source: string; target: string }> };
    }>(`/services/${serviceId}`);

    const endpointsList = data.endpoints
      .map(e => `- ${e.method} ${e.path} — ${e.summary}`)
      .join('\n');

    const connections = data.graph.edges
      .map(e => {
        const targetNode = data.graph.nodes.find(n => n.id === e.target);
        const sourceNode = data.graph.nodes.find(n => n.id === e.source);
        return `- ${sourceNode?.label || e.source} --[${e.type}]--> ${targetNode?.label || e.target}`;
      })
      .join('\n');

    return {
      content: [{
        type: 'text' as const,
        text: `# ${data.service.name}\n\n${data.service.description}\n\n## Endpoints (${data.endpoints.length})\n${endpointsList}\n\n## Connections\n${connections}`,
      }],
    };
  }
);

// Tool: get_service_graph
server.tool(
  'get_service_graph',
  'Get the dependency graph of a service — what it connects to and what connects to it',
  {
    serviceName: z.string().describe('Service name to look up'),
  },
  async ({ serviceName }) => {
    // First find service by name
    const services = await kbRequest<{ services: Array<{ id: string; name: string }> }>('/services');
    const svc = services.services.find(s => s.name.toLowerCase().includes(serviceName.toLowerCase()));

    if (!svc) {
      return { content: [{ type: 'text' as const, text: `Service "${serviceName}" not found. Available: ${services.services.map(s => s.name).join(', ')}` }] };
    }

    const graph = await kbRequest<{
      nodes: Array<{ id: string; type: string; label: string }>;
      edges: Array<{ type: string; source: string; target: string }>;
    }>(`/graph/service/${svc.id}`);

    const text = graph.nodes
      .map(n => {
        const outEdges = graph.edges.filter(e => e.source === n.id);
        const inEdges = graph.edges.filter(e => e.target === n.id);
        const connections = [
          ...outEdges.map(e => `  → [${e.type}] ${graph.nodes.find(nn => nn.id === e.target)?.label || e.target}`),
          ...inEdges.map(e => `  ← [${e.type}] ${graph.nodes.find(nn => nn.id === e.source)?.label || e.source}`),
        ].join('\n');
        return `**${n.label}** (${n.type})${connections ? '\n' + connections : ''}`;
      })
      .join('\n\n');

    return {
      content: [{ type: 'text' as const, text: `# Graph for ${svc.name}\n\n${graph.nodes.length} nodes, ${graph.edges.length} edges\n\n${text}` }],
    };
  }
);

// Tool: find_dependencies
server.tool(
  'find_dependencies',
  'Find what services depend on a given service or what a service depends on',
  {
    serviceName: z.string().describe('Service name'),
    direction: z.enum(['dependents', 'dependencies']).describe('"dependents" = who depends on this service, "dependencies" = what this service depends on'),
  },
  async ({ serviceName, direction }) => {
    const services = await kbRequest<{ services: Array<{ id: string; name: string }> }>('/services');
    const svc = services.services.find(s => s.name.toLowerCase().includes(serviceName.toLowerCase()));

    if (!svc) {
      return { content: [{ type: 'text' as const, text: `Service "${serviceName}" not found.` }] };
    }

    const data = await kbRequest<{
      nodes: Array<{ id: string; type: string; label: string }>;
      edges: Array<{ type: string; source: string; target: string }>;
    }>(`/graph/${direction}/${svc.id}`);

    const otherNodes = data.nodes.filter(n => n.id !== `service:${svc.id}`);
    const list = otherNodes.map(n => `- ${n.label}`).join('\n') || 'None found';

    const label = direction === 'dependents' ? 'depends on' : 'is a dependency of';
    return {
      content: [{ type: 'text' as const, text: `# Services that ${svc.name} ${label}:\n\n${list}` }],
    };
  }
);

// Tool: get_stats
server.tool(
  'get_stats',
  'Get overview statistics of the knowledge base',
  {},
  async () => {
    const stats = await kbRequest<Record<string, number>>('/stats');
    const text = Object.entries(stats)
      .map(([key, value]) => `- **${key}**: ${value}`)
      .join('\n');
    return { content: [{ type: 'text' as const, text: `# Knowledge Base Stats\n\n${text}` }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('EKB MCP Server running on stdio');
}

main().catch(console.error);
