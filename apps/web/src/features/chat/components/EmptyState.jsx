import React from 'react';
import { CHAT_SUGGESTIONS } from '@chatagent/shared';

export function EmptyState({ onSelectSuggestion }) {
  return (
    <div style={{ maxWidth: '680px', width: '100%', margin: 'auto', textAlign: 'center', padding: '40px 16px' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '32px', fontWeight: 400, marginBottom: '12px', color: 'var(--text)' }}>
        Where should we begin?
      </h1>
      <p style={{ fontSize: '15px', color: 'var(--muted)', marginBottom: '32px' }}>
        Ask anything with live web search, date awareness, and cross-session memory.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
        {CHAT_SUGGESTIONS.map((suggestion, idx) => (
          <button
            key={idx}
            onClick={() => onSelectSuggestion(suggestion)}
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 16px',
              color: 'var(--text)',
              fontSize: '14px',
              lineHeight: '1.45',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color var(--transition-fast), border-color var(--transition-fast)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--hover)';
              e.currentTarget.style.borderColor = 'var(--muted)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            "{suggestion}"
          </button>
        ))}
      </div>
    </div>
  );
}

