import React from 'react';
import { Message } from './Message.jsx';
import { EmptyState } from './EmptyState.jsx';

export function MessageList({
  messages = [],
  isStreaming = false,
  activeSearches = [],
  completedSearches = [],
  currentStatus = null,
  highlightedSourceIndex = null,
  onHighlightSource = () => {},
  onOpenTrace = () => {},
  onSelectSuggestion = () => {}
}) {
  if (messages.length === 0) {
    return <EmptyState onSelectSuggestion={onSelectSuggestion} />;
  }

  return (
    <div style={{ maxWidth: '720px', width: '100%', margin: '0 auto', padding: '24px 16px' }}>
      {messages.map((msg, idx) => {
        const isLatest = idx === messages.length - 1;
        return (
          <Message
            key={msg.id || idx}
            message={msg}
            isLatest={isLatest}
            isStreaming={isStreaming}
            activeSearches={isLatest ? activeSearches : []}
            completedSearches={isLatest ? completedSearches : []}
            currentStatus={isLatest ? currentStatus : null}
            highlightedSourceIndex={highlightedSourceIndex}
            onHighlightSource={onHighlightSource}
            onOpenTrace={onOpenTrace}
          />
        );
      })}
    </div>
  );
}

