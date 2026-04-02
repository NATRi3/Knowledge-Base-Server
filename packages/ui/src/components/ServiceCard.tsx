import { Link } from 'react-router-dom';
import type { Service } from '../api/client.ts';

interface Props {
  service: Service;
}

export function ServiceCard({ service }: Props) {
  return (
    <Link to={`/service/${service.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        background: '#1e293b',
        borderRadius: '12px',
        padding: '1.5rem',
        border: '1px solid #334155',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: '#818cf8', marginBottom: '0.5rem' }}>
          {service.name}
        </div>
        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '0.75rem' }}>
          {service.description?.slice(0, 120) || 'No description'}
        </div>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '12px', color: '#64748b' }}>
          <span>{service.endpoints_count || 0} endpoints</span>
          <span>{service.docs_count || 0} docs</span>
          <span>{service.tickets_count || 0} tickets</span>
        </div>
      </div>
    </Link>
  );
}
