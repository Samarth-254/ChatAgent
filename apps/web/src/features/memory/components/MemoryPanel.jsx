import React from 'react';
import { X, Calendar, MessageSquare } from 'lucide-react';
import { useMemoryTimeline } from '../hooks/useMemoryTimeline.js';
import { formatTime } from '../../../lib/formatDate.js';

export function MemoryPanel({ isOpen, onClose, onSelectSession }) {
  const { timeline, isLoading } = useMemoryTimeline();

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '380px',
        maxWidth: '90vw',
        backgroundColor: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.05)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={16} />
          <span style={{ fontSize: '14px', fontWeight: 600 }}>Memory Timeline</span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
          aria-label="Close memory panel"
        >
          <X size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <p style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.4' }}>
          All conversations are stored with local calendar timestamps. When you ask about past topics, the agent recalls them directly.
        </p>

        {isLoading ? (
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Loading timeline...</div>
        ) : timeline.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>No historical questions recorded yet.</div>
        ) : (
          timeline.map((group) => (
            <div key={group.date} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                {group.date}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      onSelectSession(item.sessionId);
                      onClose();
                    }}
                    style={{
                      padding: '8px 10px',
                      backgroundColor: 'var(--hover)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      fontSize: '13px',
                      transition: 'background-color var(--transition-fast)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatTime(item.createdAt)}</span>
                      <MessageSquare size={12} color="var(--muted)" />
                    </div>
                    <span style={{ lineHeight: '1.3' }}>{item.content}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

