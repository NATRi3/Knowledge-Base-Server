import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.tsx';
import { GraphView } from './pages/GraphView.tsx';
import { ServiceDetail } from './pages/ServiceDetail.tsx';
import { SearchPage } from './pages/Search.tsx';

const navStyle = {
  display: 'flex',
  gap: '1rem',
  padding: '1rem 2rem',
  background: '#1e293b',
  borderBottom: '1px solid #334155',
};

const linkStyle = {
  color: '#94a3b8',
  textDecoration: 'none',
  padding: '0.5rem 1rem',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 500,
};

const activeLinkStyle = {
  ...linkStyle,
  color: '#e2e8f0',
  background: '#334155',
};

export function App() {
  return (
    <BrowserRouter>
      <nav style={navStyle}>
        <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '16px', marginRight: '1rem' }}>
          EKB
        </span>
        <NavLink to="/" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle} end>
          Dashboard
        </NavLink>
        <NavLink to="/graph" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
          Graph
        </NavLink>
        <NavLink to="/search" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
          Search
        </NavLink>
      </nav>
      <main style={{ padding: '2rem' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/graph" element={<GraphView />} />
          <Route path="/service/:id" element={<ServiceDetail />} />
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
