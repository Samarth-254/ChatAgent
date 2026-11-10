import React, { useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';

export function Composer({
  input,
  setInput,
  onSend,
  onStop,
  isStreaming,
  disabled = false
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && input.trim()) {
        onSend();
      }
    }
  };

  return (
    <footer
      style={{
        position: 'sticky',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        padding: '16px 20px 24px 20px',
        background: 'linear-gradient(to top, var(--bg) 80%, transparent)',
        zIndex: 10
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isStreaming) {
            onStop();
          } else if (input.trim()) {
            onSend();
          }
        }}
        style={{
          maxWidth: '720px',
          width: '100%',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          rows={1}
          disabled={disabled}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontSize: '15px',
            lineHeight: '1.45',
            resize: 'none',
            maxHeight: '160px',
            padding: '4px 0'
          }}
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            style={{
              backgroundColor: 'var(--button-bg)',
              color: 'var(--button-text)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Stop generating"
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || disabled}
            style={{
              backgroundColor: 'var(--button-bg)',
              color: 'var(--button-text)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: input.trim() && !disabled ? 'pointer' : 'not-allowed',
              opacity: input.trim() && !disabled ? 1 : 0.3,
              transition: 'opacity var(--transition-fast)'
            }}
            title="Send message"
          >
            <ArrowUp size={16} />
          </button>
        )}
      </form>
    </footer>
  );
}

