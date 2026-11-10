import React, { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '../features/sessions/components/Sidebar.jsx';
import { MessageList } from '../features/chat/components/MessageList.jsx';
import { Composer } from '../features/chat/components/Composer.jsx';
import { TraceDrawer } from '../features/chat/components/TraceDrawer.jsx';
import { MemoryPanel } from '../features/memory/components/MemoryPanel.jsx';
import { useSessions } from '../features/sessions/hooks/useSessions.js';
import { useChatStream } from '../features/chat/hooks/useChatStream.js';
import { useAutoScroll } from '../features/chat/hooks/useAutoScroll.js';
import { useTheme } from '../features/settings/useTheme.js';
import { fetchSession } from '../features/sessions/api/sessionsApi.js';

export function App() {
  const [activeSessionId, setActiveSessionId] = useState(() => crypto.randomUUID());
  const [input, setInput] = useState('');
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [activeTrace, setActiveTrace] = useState(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const { isDark, toggleTheme } = useTheme();
  const { sessions, refetch: refetchSessions, deleteSession, renameSession } = useSessions();

  const {
    state: chatState,
    sendMessage,
    stopGeneration,
    loadMessages,
    highlightSource
  } = useChatStream({
    sessionId: activeSessionId,
    onFinish: () => refetchSessions()
  });

  const { containerRef, handleScroll } = useAutoScroll([chatState.messages]);

  // Load existing session history when activeSessionId changes
  useEffect(() => {
    let isCurrent = true;
    if (activeSessionId) {
      fetchSession(activeSessionId).then(data => {
        if (isCurrent && data?.messages) {
          loadMessages(data.messages);
        }
      }).catch(() => {
        // new empty session
      });
    }
    return () => { isCurrent = false; };
  }, [activeSessionId, loadMessages]);

  const handleSelectSession = (id) => {
    setActiveSessionId(id);
    setIsMobileSidebarOpen(false);
  };

  const handleNewChat = () => {
    const newId = crypto.randomUUID();
    setActiveSessionId(newId);
    loadMessages([]);
    setIsMobileSidebarOpen(false);
  };

  const handleSend = () => {
    if (!input.trim() || chatState.isStreaming) return;
    const text = input;
    setInput('');
    sendMessage(text);
  };

  const handleSelectSuggestion = (suggestion) => {
    sendMessage(suggestion);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={(id) => {
          deleteSession(id);
          if (id === activeSessionId) handleNewChat();
        }}
        onRenameSession={(id, title) => renameSession({ id, title })}
        onToggleMemory={() => setIsMemoryOpen(!isMemoryOpen)}
        isMemoryOpen={isMemoryOpen}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        isOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}>
        {/* Top Header */}
        <header
          style={{
            height: '48px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: '12px',
            backgroundColor: 'var(--bg)',
            zIndex: 10
          }}
        >
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            style={{ display: 'none', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
            className="mobile-menu-btn"
            aria-label="Toggle mobile sidebar"
          >
            <Menu size={18} />
          </button>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>
            {sessions.find(s => s.id === activeSessionId)?.title || 'New Chat'}
          </span>
        </header>

        {/* Message scroll container */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
        >
          <MessageList
            messages={chatState.messages}
            isStreaming={chatState.isStreaming}
            activeSearches={chatState.activeSearches}
            completedSearches={chatState.completedSearches}
            currentStatus={chatState.currentStatus}
            highlightedSourceIndex={chatState.highlightedSourceIndex}
            onHighlightSource={highlightSource}
            onOpenTrace={(trace) => setActiveTrace(trace)}
            onSelectSuggestion={handleSelectSuggestion}
          />
        </div>

        {/* Fixed composer */}
        <Composer
          input={input}
          setInput={setInput}
          onSend={handleSend}
          onStop={stopGeneration}
          isStreaming={chatState.isStreaming}
        />
      </main>

      {/* Side Overlays */}
      <TraceDrawer
        isOpen={!!activeTrace}
        onClose={() => setActiveTrace(null)}
        trace={activeTrace}
      />

      <MemoryPanel
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
        onSelectSession={handleSelectSession}
      />
    </div>
  );
}

