import { useEffect, useState } from 'react';
import { getNeighbors, type GraphData, type GraphNode } from '../api/client.ts';

interface Props {
  node: GraphNode;
  onClose: () => void;
}

const panelStyle = {
  width: '350px',
  background: '#1e293b',
  borderRadius: '12px',
  border: '1px solid #334155',
  padding: '1.5rem',
  overflowY: 'auto' as const,
};

const labelStyle = {
  fontSize: '12px',
  color: '#64748b',
  marginBottom: '4px',
};

const valueStyle = {
  fontSize: '14px',
  color: '#e2e8f0',
  marginBottom: '1rem',
};

export function NodeDetails({ node, onClose }: Props) {
  const [neighbors, setNeighbors] = useState<GraphData | null>(null);

  useEffect(() => {
    getNeighbors(node.id, 1).then(setNeighbors).catch(console.error);
  }, [node.id]);

  const connectedNodes = neighbors?.nodes.filter(n => n.id !== node.id) || [];
  const edges = neighbors?.edges || [];

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
        <div>
          <span style={{
            display: 'inline-block',
            background: node.color || '#4F46E5',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '4px',
            marginBottom: '0.5rem',
          }}>
            {node.type}
          </span>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0' }}>{node.label}</h3>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px' }}
        >
          x
        </button>
      </div>

      {node.data && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={labelStyle}>Properties</div>
          {Object.entries(node.data)
            .filter(([k]) => !['x', 'y', 'size', 'color', 'type', 'label'].includes(k))
            .map(([key, value]) => (
              <div key={key} style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '11px', color: '#64748b' }}>{key}</div>
                <div style={{ fontSize: '13px', color: '#cbd5e1', wordBreak: 'break-all' }}>
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </div>
              </div>
            ))}
        </div>
      )}

      <div style={labelStyle}>Connections ({connectedNodes.length})</div>
      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {connectedNodes.map(n => {
          const edge = edges.find(e =>
            (e.source === node.id && e.target === n.id) ||
            (e.target === node.id && e.source === n.id)
          );
          return (
            <div key={n.id} style={{
              padding: '0.5rem',
              borderRadius: '6px',
              marginBottom: '4px',
              background: '#0f172a',
              fontSize: '13px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#e2e8f0' }}>{n.label}</span>
                <span style={{
                  fontSize: '10px',
                  color: '#64748b',
                  background: '#1e293b',
                  padding: '1px 6px',
                  borderRadius: '3px',
                }}>
                  {n.type}
                </span>
              </div>
              {edge && (
                <div style={{ fontSize: '11px', color: '#818cf8', marginTop: '2px' }}>
                  {edge.type}
                </div>
              )}
            </div>
          );
        })}
        {connectedNodes.length === 0 && (
          <div style={{ color: '#64748b', fontSize: '13px' }}>No connections found</div>
        )}
      </div>
    </div>
  );
}
