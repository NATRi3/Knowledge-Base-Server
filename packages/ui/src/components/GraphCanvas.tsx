import { useEffect, useRef, useState } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import type { GraphData, GraphNode } from '../api/client.ts';

interface Props {
  data: GraphData;
  onNodeClick?: (node: GraphNode) => void;
  style?: React.CSSProperties;
}

// Simple force-directed layout
function applyLayout(graph: Graph, iterations = 100): void {
  const nodes = graph.nodes();
  const positions = new Map<string, { x: number; y: number }>();

  // Initialize random positions
  nodes.forEach(id => {
    positions.set(id, {
      x: (Math.random() - 0.5) * 500,
      y: (Math.random() - 0.5) * 500,
    });
  });

  const repulsion = 100;
  const attraction = 0.01;
  const damping = 0.9;
  const velocities = new Map<string, { vx: number; vy: number }>();
  nodes.forEach(id => velocities.set(id, { vx: 0, vy: 0 }));

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      const posA = positions.get(nodes[i])!;
      for (let j = i + 1; j < nodes.length; j++) {
        const posB = positions.get(nodes[j])!;
        let dx = posA.x - posB.x;
        let dy = posA.y - posB.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;

        const velA = velocities.get(nodes[i])!;
        const velB = velocities.get(nodes[j])!;
        velA.vx += dx; velA.vy += dy;
        velB.vx -= dx; velB.vy -= dy;
      }
    }

    // Attraction along edges
    graph.forEachEdge((_e, _a, source, target) => {
      const posA = positions.get(source)!;
      const posB = positions.get(target)!;
      const dx = posB.x - posA.x;
      const dy = posB.y - posA.y;

      const velA = velocities.get(source)!;
      const velB = velocities.get(target)!;
      velA.vx += dx * attraction; velA.vy += dy * attraction;
      velB.vx -= dx * attraction; velB.vy -= dy * attraction;
    });

    // Apply velocities
    nodes.forEach(id => {
      const pos = positions.get(id)!;
      const vel = velocities.get(id)!;
      vel.vx *= damping;
      vel.vy *= damping;
      pos.x += vel.vx;
      pos.y += vel.vy;
    });
  }

  // Apply to graph
  nodes.forEach(id => {
    const pos = positions.get(id)!;
    graph.setNodeAttribute(id, 'x', pos.x);
    graph.setNodeAttribute(id, 'y', pos.y);
  });
}

const NODE_COLORS: Record<string, string> = {
  service: '#4F46E5',
  endpoint: '#059669',
  document: '#D97706',
  schema: '#7C3AED',
  ticket: '#DC2626',
  team: '#2563EB',
  technology: '#0891B2',
};

const NODE_SIZES: Record<string, number> = {
  service: 12,
  endpoint: 5,
  document: 7,
  schema: 4,
  ticket: 6,
  team: 10,
  technology: 8,
};

export function GraphCanvas({ data, onNodeClick, style }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.nodes.length === 0) return;

    // Build graphology graph
    const graph = new Graph({ multi: true, type: 'directed' });

    data.nodes.forEach(node => {
      if (!graph.hasNode(node.id)) {
        graph.addNode(node.id, {
          label: node.label || node.id,
          size: node.size || NODE_SIZES[node.type] || 6,
          color: node.color || NODE_COLORS[node.type] || '#64748b',
          x: node.x ?? 0,
          y: node.y ?? 0,
          type: node.type,
        });
      }
    });

    data.edges.forEach((edge, i) => {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        graph.addEdge(edge.source, edge.target, {
          label: edge.type,
          size: 1,
          color: '#475569',
        });
      }
    });

    // Apply layout if no positions set
    const hasPositions = data.nodes.some(n => n.x && n.y);
    if (!hasPositions) {
      applyLayout(graph);
    }

    // Create Sigma instance
    if (sigmaRef.current) {
      sigmaRef.current.kill();
    }

    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeColor: '#475569',
      defaultEdgeType: 'arrow',
      labelColor: { color: '#e2e8f0' },
      labelFont: 'Inter, system-ui, sans-serif',
      labelSize: 12,
      labelRenderedSizeThreshold: 8,
    });

    sigma.on('clickNode', ({ node }) => {
      const attrs = graph.getNodeAttributes(node);
      onNodeClick?.({
        id: node,
        type: attrs.type as string,
        label: attrs.label as string,
        data: attrs as any,
      });
    });

    sigma.on('enterNode', ({ node }) => setHoveredNode(node));
    sigma.on('leaveNode', () => setHoveredNode(null));

    sigmaRef.current = sigma;

    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [data]);

  return (
    <div style={{ position: 'relative', ...style }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#0f172a', borderRadius: '12px' }} />
      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, background: '#1e293b', borderRadius: '8px',
        padding: '0.75rem', fontSize: '12px', border: '1px solid #334155',
      }}>
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2px' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            <span style={{ color: '#94a3b8' }}>{type}</span>
          </div>
        ))}
      </div>
      {hoveredNode && (
        <div style={{
          position: 'absolute', top: 12, right: 12, background: '#1e293b', borderRadius: '8px',
          padding: '0.75rem', fontSize: '13px', border: '1px solid #334155', maxWidth: '300px',
        }}>
          {hoveredNode}
        </div>
      )}
    </div>
  );
}
