import React, { useState } from 'react';
import { Search, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';

export function StatusTimeline({ activeSearches = [], completedSearches = [], currentStatus = null, isStreaming = false }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const totalSearches = activeSearches.length + completedSearches.length;

  if (totalSearches === 0 && !currentStatus) return null;

  // When finished streaming, show collapsed summary
  if (!isStreaming && completedSearches.length > 0) {
    return (
      <div style={{ marginBottom: '12px' }}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '2px 0'
          }}
        >
          <CheckCircle2 size={13} />
          <span>Searched {completedSearches.length} {completedSearches.length === 1 ? 'query' : 'queries'}</span>
          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {isExpanded && (
          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {completedSearches.map((s, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: '12px',
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  paddingLeft: '18px'
                }}
              >
                <span>• "{s.query}"</span>
                <span style={{ fontSize: '11px', opacity: 0.7 }}>({s.durationMs}ms)</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
      {currentStatus && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--hover)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 10px',
            fontSize: '12px',
            color: 'var(--muted)',
            width: 'fit-content'
          }}
        >
          <Search size={13} />
          <span>{currentStatus}</span>
        </div>
      )}
    </div>
  );
}

