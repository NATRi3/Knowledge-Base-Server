import { useEffect, useState } from 'react';
import { getGraph, type GraphData, type GraphNode } from '../api/client.ts';
import { GraphCanvas } from '../components/GraphCanvas.tsx';
import { NodeDetails } from '../components/NodeDetails.tsx';

const filterBtnStyle = (active: boolean) => ({
  background: active ? '#4F46E5' : '#1e293b',
  color: active ? '#fff' : '#94a3b8',
  border: '1px solid ' + (active ? '#4F46E5' : '#334155'),
  borderRadius: '6px',
  padding: '0.4rem 0.8rem',
  fontSize: '12px',
  cursor: 'pointer',
});

const NODE_TYPES = ['service', 'endpoint', 'document', 'schema', 'ticket', 'team', 'technology'];

export function GraphView() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [filteredData, setFilteredData] = useState<GraphData>({ nodes: [], edges: [] });
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(NODE_TYPES));
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGraph()
      .then(data => {
        setGraphData(data);
        setFilteredData(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const filteredNodes = graphData.nodes.filter(n => activeFilters.has(n.type));
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = graphData.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    setFilteredData({ nodes: filteredNodes, edges: filteredEdges });
  }, [activeFilters, graphData]);

  const toggleFilter = (type: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  if (loading) {
    return <div style={{ color: '#64748b', textAlign: 'center', marginTop: '4rem' }}>Loading graph...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Architecture Graph</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {NODE_TYPES.map(type => (
            <button key={type} style={filterBtnStyle(activeFilters.has(type))} onClick={() => toggleFilter(type)}>
              {type}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 180px)' }}>
        <GraphCanvas
          data={filteredData}
          onNodeClick={setSelectedNode}
          style={{ flex: 1, minHeight: 0 }}
        />
        {selectedNode && (
          <NodeDetails
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '12px', color: '#64748b' }}>
        {filteredData.nodes.length} nodes, {filteredData.edges.length} edges
      </div>
    </div>
  );
}
