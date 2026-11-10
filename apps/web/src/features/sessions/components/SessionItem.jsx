import React, { useState } from 'react';
import { Trash2, Edit2, Check, X } from 'lucide-react';

export function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  onRename
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(session.title || 'Untitled');

  const handleSaveRename = (e) => {
    e.stopPropagation();
    if (title.trim() && title !== session.title) {
      onRename(session.id, title.trim());
    }
    setIsEditing(false);
  };

  const handleCancelRename = (e) => {
    e.stopPropagation();
    setTitle(session.title || 'Untitled');
    setIsEditing(false);
  };

  return (
    <div
      onClick={() => onSelect(session.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: isActive ? 'var(--hover)' : 'transparent',
        color: isActive ? 'var(--text)' : 'var(--muted)',
        fontSize: '13px',
        cursor: 'pointer',
        transition: 'background-color var(--transition-fast)'
      }}
      className="session-item-row"
    >
      {isEditing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }} onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '2px 4px',
              fontSize: '13px',
              color: 'var(--text)'
            }}
          />
          <button onClick={handleSaveRename} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}>
            <Check size={14} />
          </button>
          <button onClick={handleCancelRename} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
            {session.title || 'Untitled'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', opacity: isActive ? 1 : 0.6 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px' }}
              title="Rename session"
            >
              <Edit2 size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Delete this chat session?')) {
                  onDelete(session.id);
                }
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px' }}
              title="Delete session"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

