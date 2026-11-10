import React from 'react';
import { X, Clock, Database, Search, Cpu } from 'lucide-react';

export function TraceDrawer({ isOpen, onClose, trace }) {
  if (!isOpen || !trace) return null;

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
        <span style={{ fontSize: '14px', fontWeight: 600 }}>Execution Trace</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
          aria-label="Close trace drawer"
        >
          <X size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Model & Routing */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
            <Cpu size={14} />
            <span>Model & Router</span>
          </div>
          <div style={{ backgroundColor: 'var(--hover)', padding: '10px', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
            <div><strong>Model:</strong> {trace.model || 'Auto'}</div>
            <div style={{ marginTop: '4px', color: 'var(--muted)' }}><strong>Reason:</strong> {trace.routerReason || 'Standard query'}</div>
          </div>
        </div>

        {/* Date Grounding */}
        {trace.dateNotes && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
              <Clock size={14} />
              <span>Resolved Date Grounding</span>
            </div>
            <div style={{ backgroundColor: 'var(--hover)', padding: '10px', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
              <code>{trace.dateNotes}</code>
            </div>
          </div>
        )}

        {/* Tool Executions */}
        {trace.searches && trace.searches.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
              <Search size={14} />
              <span>Web Searches ({trace.searches.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {trace.searches.map((s, idx) => (
                <div key={idx} style={{ backgroundColor: 'var(--hover)', padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: '12px' }}>
                  <div style={{ fontWeight: 500 }}>"{s.query}"</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginTop: '4px', fontSize: '11px' }}>
                    <span>{s.afterDate ? `after: ${s.afterDate}` : 'all dates'}</span>
                    <span>{s.ms}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Latency & Timings */}
        {trace.timings && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
              <Clock size={14} />
              <span>Latencies</span>
            </div>
            <div style={{ backgroundColor: 'var(--hover)', padding: '10px', borderRadius: 'var(--radius-md)', fontSize: '13px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Time to First Token</div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{trace.timings.ttftMs}ms</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Total Duration</div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{trace.timings.totalMs}ms</div>
              </div>
            </div>
          </div>
        )}

        {/* Recall Block Summary */}
        {trace.recallSummary && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
              <Database size={14} />
              <span>Memory Recall</span>
            </div>
            <div style={{ backgroundColor: 'var(--hover)', padding: '10px', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--muted)' }}>
              {trace.recallSummary}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

