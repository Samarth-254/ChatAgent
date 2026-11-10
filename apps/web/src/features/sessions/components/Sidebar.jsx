import React from 'react';
import { Plus, Clock, Moon, Sun, X } from 'lucide-react';
import { SessionItem } from './SessionItem.jsx';
import { formatGroupDate } from '../../../lib/formatDate.js';

export function Sidebar({
  sessions = [],
  activeSessionId = null,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  onToggleMemory,
  isMemoryOpen = false,
  isDark = false,
  onToggleTheme,
  isOpen = false,
  onCloseMobile
}) {
  // Group sessions by date bucket
  const groups = {
    'Today': [],
    'Yesterday': [],
    'Previous 7 days': [],
    'Older': []
  };

  for (const s of sessions) {
    const bucket = formatGroupDate(s.updated_at || s.created_at);
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket].push(s);
  }

  return (
    <aside
      style={{
        width: '260px',
        backgroundColor: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        zIndex: 40,
        position: 'relative'
      }}
      className={isOpen ? 'sidebar-mobile-open' : ''}
    >
      {/* Header */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={onNewChat}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <Plus size={15} />
            <span>New chat</span>
          </button>

          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              style={{ display: 'none', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', marginLeft: '8px' }}
              className="mobile-close-btn"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Memory timeline toggle */}
        <button
          onClick={onToggleMemory}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: isMemoryOpen ? 'var(--hover)' : 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text)',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          <Clock size={15} />
          <span>Memory Timeline</span>
        </button>
      </div>

      {/* Sessions list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px 12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {Object.entries(groups).map(([groupTitle, items]) => {
          if (items.length === 0) return null;
          return (
            <div key={groupTitle}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', padding: '4px 8px', marginBottom: '2px' }}>
                {groupTitle}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {items.map(s => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    isActive={s.id === activeSessionId}
                    onSelect={onSelectSession}
                    onDelete={onDeleteSession}
                    onRename={onRenameSession}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer / Theme toggle */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Theme</span>
        <button
          onClick={onToggleTheme}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: 'var(--text)',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '4px 6px',
            borderRadius: 'var(--radius-sm)'
          }}
          title="Toggle light / dark theme"
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
          <span>{isDark ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </aside>
  );
}

