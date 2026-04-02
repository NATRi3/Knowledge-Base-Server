import { useState } from 'react';
import { search, type SearchResult } from '../api/client.ts';

const inputStyle = {
  width: '100%',
  padding: '0.75rem 1rem',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '10px',
  color: '#e2e8f0',
  fontSize: '15px',
  outline: 'none',
};

const resultCardStyle = {
  background: '#1e293b',
  borderRadius: '10px',
  padding: '1.25rem',
  border: '1px solid #334155',
  marginBottom: '0.75rem',
};

const SOURCE_COLORS: Record<string, string> = {
  swagger: '#059669',
  confluence: '#D97706',
  jira: '#DC2626',
  service: '#4F46E5',
  endpoint: '#059669',
  document: '#D97706',
  ticket: '#DC2626',
  graph: '#818cf8',
};

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const data = await search(query);
      setResults(data.results);
      setIntent(data.intent);
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Search Knowledge Base</h1>

      <form onSubmit={handleSearch} style={{ marginBottom: '1.5rem' }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search across services, docs, APIs, tickets..."
          style={inputStyle}
          autoFocus
        />
      </form>

      {loading && <div style={{ color: '#64748b', textAlign: 'center' }}>Searching...</div>}

      {searched && !loading && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '13px' }}>
              {results.length} results found
            </span>
            {intent && (
              <span style={{
                fontSize: '11px', color: '#818cf8', background: '#1e1b4b',
                padding: '2px 8px', borderRadius: '4px',
              }}>
                intent: {intent}
              </span>
            )}
          </div>

          {results.map((r, i) => (
            <div key={i} style={resultCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {r.title && (
                    <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '14px' }}>{r.title}</span>
                  )}
                  <span style={{
                    fontSize: '10px',
                    color: SOURCE_COLORS[r.sourceType] || '#64748b',
                    background: '#0f172a',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontWeight: 600,
                  }}>
                    {r.sourceType}
                  </span>
                  <span style={{
                    fontSize: '10px',
                    color: '#64748b',
                    background: '#0f172a',
                    padding: '2px 6px',
                    borderRadius: '3px',
                  }}>
                    {r.type}
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  {(r.score * 100).toFixed(1)}%
                </span>
              </div>
              <div style={{
                fontSize: '13px',
                color: '#94a3b8',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                maxHeight: '120px',
                overflow: 'hidden',
              }}>
                {r.content.slice(0, 500)}
              </div>
            </div>
          ))}

          {results.length === 0 && (
            <div style={{ color: '#64748b', textAlign: 'center', marginTop: '2rem' }}>
              No results found. Try a different query or run ingestion first.
            </div>
          )}
        </>
      )}
    </div>
  );
}
