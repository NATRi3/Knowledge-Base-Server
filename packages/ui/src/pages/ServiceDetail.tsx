import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getService, type GraphData, type GraphNode } from '../api/client.ts';
import { GraphCanvas } from '../components/GraphCanvas.tsx';
import { NodeDetails } from '../components/NodeDetails.tsx';

const cardStyle = {
  background: '#1e293b',
  borderRadius: '12px',
  padding: '1.5rem',
  border: '1px solid #334155',
};

export function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [service, setService] = useState<any>(null);
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getService(id)
      .then(data => {
        setService(data.service);
        setEndpoints(data.endpoints);
        setGraphData(data.graph);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div style={{ color: '#64748b', textAlign: 'center', marginTop: '4rem' }}>Loading...</div>;
  }

  if (!service) {
    return <div style={{ color: '#ef4444' }}>Service not found</div>;
  }

  const methodColors: Record<string, string> = {
    GET: '#22c55e', POST: '#3b82f6', PUT: '#eab308', DELETE: '#ef4444',
    PATCH: '#a855f7', HEAD: '#64748b', OPTIONS: '#64748b',
  };

  return (
    <div>
      <Link to="/" style={{ color: '#818cf8', fontSize: '13px', textDecoration: 'none' }}>
        &larr; Back to Dashboard
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{service.name}</h1>
        <span style={{ fontSize: '12px', color: '#64748b', background: '#334155', padding: '2px 8px', borderRadius: '4px' }}>
          {service.source}
        </span>
      </div>

      {service.description && (
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem', fontSize: '14px' }}>
          {service.description}
        </p>
      )}

      {/* Service graph */}
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Service Graph</h2>
      <div style={{ display: 'flex', gap: '1rem', height: '400px', marginBottom: '2rem' }}>
        <GraphCanvas
          data={graphData}
          onNodeClick={setSelectedNode}
          style={{ flex: 1, minHeight: 0 }}
        />
        {selectedNode && (
          <NodeDetails node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}
      </div>

      {/* Endpoints */}
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        API Endpoints ({endpoints.length})
      </h2>
      <div style={cardStyle}>
        {endpoints.length === 0 ? (
          <div style={{ color: '#64748b' }}>No endpoints</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem', width: '80px' }}>Method</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Path</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Summary</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((ep: any) => (
                <tr key={ep.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '0.5rem' }}>
                    <span style={{
                      color: methodColors[ep.method] || '#64748b',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                    }}>
                      {ep.method}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem', fontFamily: 'monospace', color: '#e2e8f0' }}>{ep.path}</td>
                  <td style={{ padding: '0.5rem', color: '#94a3b8' }}>{ep.summary}</td>
                  <td style={{ padding: '0.5rem', color: '#64748b' }}>
                    {JSON.parse(ep.tags || '[]').join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
