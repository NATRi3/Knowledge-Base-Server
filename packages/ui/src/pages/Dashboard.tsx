import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStats, getServices, triggerIngestion, getIngestionHistory, type Stats, type Service } from '../api/client.ts';

const cardStyle = {
  background: '#1e293b',
  borderRadius: '12px',
  padding: '1.5rem',
  border: '1px solid #334155',
};

const statValueStyle = {
  fontSize: '2rem',
  fontWeight: 700,
  color: '#818cf8',
};

const buttonStyle = {
  background: '#4F46E5',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  padding: '0.75rem 1.5rem',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
};

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [ingesting, setIngesting] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    getStats().then(setStats).catch(console.error);
    getServices().then(d => setServices(d.services)).catch(console.error);
    getIngestionHistory().then(d => setHistory(d.history)).catch(console.error);
  }, []);

  const handleIngest = async () => {
    setIngesting(true);
    try {
      await triggerIngestion();
    } catch (err) {
      console.error(err);
    }
    // Poll for completion
    const interval = setInterval(async () => {
      const h = await getIngestionHistory();
      setHistory(h.history);
      const running = h.history.some((x: any) => x.status === 'running');
      if (!running) {
        clearInterval(interval);
        setIngesting(false);
        getStats().then(setStats);
        getServices().then(d => setServices(d.services));
      }
    }, 3000);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Dashboard</h1>
        <button style={buttonStyle} onClick={handleIngest} disabled={ingesting}>
          {ingesting ? 'Ingesting...' : 'Run Ingestion'}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {stats && (
          <>
            <div style={cardStyle}>
              <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '0.5rem' }}>Services</div>
              <div style={statValueStyle}>{stats.services}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '0.5rem' }}>Endpoints</div>
              <div style={statValueStyle}>{stats.endpoints}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '0.5rem' }}>Documents</div>
              <div style={statValueStyle}>{stats.documents}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '0.5rem' }}>Embeddings</div>
              <div style={statValueStyle}>{stats.embeddings}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '0.5rem' }}>Jira Tickets</div>
              <div style={statValueStyle}>{stats.tickets}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '0.5rem' }}>Graph Nodes</div>
              <div style={statValueStyle}>{stats.graphNodes}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '0.5rem' }}>Graph Edges</div>
              <div style={statValueStyle}>{stats.graphEdges}</div>
            </div>
          </>
        )}
      </div>

      {/* Services */}
      <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem' }}>Services</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {services.map(svc => (
          <Link to={`/service/${svc.id}`} key={svc.id} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ ...cardStyle, cursor: 'pointer', transition: 'border-color 0.2s' }}>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#818cf8', marginBottom: '0.5rem' }}>
                {svc.name}
              </div>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '0.75rem' }}>
                {svc.description?.slice(0, 120) || 'No description'}
              </div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '12px', color: '#64748b' }}>
                <span>{svc.endpoints_count || 0} endpoints</span>
                <span>{svc.docs_count || 0} docs</span>
                <span>{svc.tickets_count || 0} tickets</span>
              </div>
            </div>
          </Link>
        ))}
        {services.length === 0 && (
          <div style={{ color: '#64748b' }}>No services yet. Run ingestion to load data.</div>
        )}
      </div>

      {/* Ingestion History */}
      <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem' }}>Ingestion History</h2>
      <div style={cardStyle}>
        {history.length === 0 ? (
          <div style={{ color: '#64748b' }}>No ingestion runs yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Source</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Target</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Items</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 20).map((h: any) => (
                <tr key={h.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '0.5rem' }}>{h.source}</td>
                  <td style={{ padding: '0.5rem', color: '#64748b' }}>{h.sourceUrl}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <span style={{
                      color: h.status === 'completed' ? '#22c55e' : h.status === 'running' ? '#eab308' : '#ef4444',
                    }}>
                      {h.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>{h.itemsProcessed}</td>
                  <td style={{ padding: '0.5rem', color: '#64748b' }}>{h.startedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
