import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { Copy, Check, Activity } from 'lucide-react';
import { SourceCards } from './SourceCards.jsx';
import { StatusTimeline } from './StatusTimeline.jsx';
import { formatTime } from '../../../lib/formatDate.js';

export function Message({
  message,
  isLatest = false,
  isStreaming = false,
  activeSearches = [],
  completedSearches = [],
  currentStatus = null,
  highlightedSourceIndex = null,
  onHighlightSource = () => {},
  onOpenTrace = () => {}
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', marginBottom: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', maxWidth: '82%' }}>
          <div
            style={{
              backgroundColor: 'var(--bubble)',
              color: 'var(--text)',
              padding: '12px 16px',
              borderRadius: '16px 16px 4px 16px',
              fontSize: '15px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap'
            }}
          >
            {message.content}
          </div>
          {message.created_at && (
            <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', opacity: 0.75 }}>
              {formatTime(message.created_at)}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Assistant Message
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '32px' }}>
      {isLatest && (
        <StatusTimeline
          activeSearches={activeSearches}
          completedSearches={completedSearches}
          currentStatus={currentStatus}
          isStreaming={isStreaming}
        />
      )}

      <div className="markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={{
            a: ({ _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
            text: ({ _node, children }) => {
              // Turn [1], [2] into interactive citation buttons
              if (typeof children === 'string') {
                const parts = children.split(/(\[\d+\])/g);
                return (
                  <>
                    {parts.map((part, i) => {
                      const match = part.match(/\[(\d+)\]/);
                      if (match) {
                        const idx = parseInt(match[1], 10) - 1;
                        return (
                          <button
                            key={i}
                            className={`citation-ref ${highlightedSourceIndex === idx ? 'highlighted' : ''}`}
                            onClick={() => onHighlightSource(idx)}
                            title={`Jump to source [${match[1]}]`}
                          >
                            [{match[1]}]
                          </button>
                        );
                      }
                      return part;
                    })}
                  </>
                );
              }
              return children;
            }
          }}
        >
          {message.content}
        </ReactMarkdown>

        {isStreaming && isLatest && (
          <span
            style={{
              display: 'inline-block',
              width: '6px',
              height: '15px',
              backgroundColor: 'var(--text)',
              marginLeft: '4px',
              verticalAlign: 'middle',
              animation: 'blink 0.8s infinite'
            }}
          />
        )}
      </div>

      <SourceCards sources={message.sources} highlightedIndex={highlightedSourceIndex} />

      {/* Message action bar */}
      {!isStreaming && message.content && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
          <button
            onClick={handleCopy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '12px',
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: 'var(--radius-sm)'
            }}
            title="Copy message"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {message.meta && (
            <button
              onClick={() => onOpenTrace(message.meta)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 'var(--radius-sm)'
              }}
              title="Inspect execution trace"
            >
              <Activity size={13} />
              <span>Trace</span>
            </button>
          )}

          {message.created_at && (
            <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: 'auto', opacity: 0.75 }}>
              {formatTime(message.created_at)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

