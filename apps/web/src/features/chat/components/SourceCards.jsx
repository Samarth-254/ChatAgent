import React from 'react';
import { ExternalLink } from 'lucide-react';

export function SourceCards({ sources = [], highlightedIndex = null }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: '8px' }}>
        Sources
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
        {sources.map((s, idx) => {
          const isHighlighted = highlightedIndex === idx;
          const isOfficial = s.type === 'official';

          return (
            <a
              key={s.url || idx}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '8px 10px',
                backgroundColor: 'var(--surface)',
                border: `1px solid ${isHighlighted ? 'var(--text)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                color: 'var(--text)',
                transition: 'border-color var(--transition-fast)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.domain || 'web'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {isOfficial && (
                    <span style={{ fontSize: '10px', padding: '1px 4px', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--muted)' }}>
                      Official
                    </span>
                  )}
                  <ExternalLink size={12} color="var(--muted)" />
                </div>
              </div>
              <span style={{ fontSize: '13px', lineHeight: '1.3', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {s.title || s.url}
              </span>
              {s.publishedDate && (
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  {s.publishedDate}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}

