let currentSessionId = null;
let activeAbortController = null;
let isGenerating = false;

const chatContainer = document.getElementById('chatContainer');
const messagesList = document.getElementById('messagesList');
const emptyState = document.getElementById('emptyState');
const userInput = document.getElementById('userInput');
const composerForm = document.getElementById('composerForm');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const newChatBtn = document.getElementById('newChatBtn');
const sessionsList = document.getElementById('sessionsList');
const currentSessionTitle = document.getElementById('currentSessionTitle');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');

// Auto-resize textarea
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
});

// Keypress handling: Enter to send, Shift+Enter newline
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!isGenerating && userInput.value.trim()) {
      composerForm.dispatchEvent(new Event('submit'));
    }
  }
});

// Mobile sidebar toggle
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// New chat
newChatBtn.addEventListener('click', () => {
  if (isGenerating && activeAbortController) {
    activeAbortController.abort();
  }
  startNewChat();
});

function startNewChat() {
  currentSessionId = `session_${Date.now()}`;
  currentSessionTitle.textContent = 'New Chat';
  messagesList.innerHTML = '';
  emptyState.classList.remove('hidden');
  userInput.value = '';
  userInput.style.height = 'auto';
  loadSessions();
}

// Suggestion chips
document.querySelectorAll('.suggestion-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const prompt = btn.getAttribute('data-prompt');
    userInput.value = prompt;
    userInput.dispatchEvent(new Event('input'));
    composerForm.dispatchEvent(new Event('submit'));
  });
});

// Load sessions from server
async function loadSessions() {
  try {
    const res = await fetch('/api/sessions');
    if (!res.ok) return;
    const sessions = await res.json();
    sessionsList.innerHTML = '';

    sessions.forEach(s => {
      const item = document.createElement('div');
      item.className = `session-item ${s.id === currentSessionId ? 'active' : ''}`;
      item.innerHTML = `
        <span class="session-name" title="${escapeHtml(s.title)}">${escapeHtml(s.title || 'Untitled')}</span>
        <button class="session-del-btn" title="Delete conversation" data-id="${s.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;

      item.querySelector('.session-name').addEventListener('click', () => selectSession(s.id));
      item.querySelector('.session-del-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(s.id);
      });

      sessionsList.appendChild(item);
    });
  } catch (err) {
    console.error('Failed to load sessions:', err);
  }
}

async function selectSession(sessionId) {
  if (isGenerating && activeAbortController) {
    activeAbortController.abort();
  }
  try {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) return;
    const data = await res.json();
    currentSessionId = data.id;
    currentSessionTitle.textContent = data.title || 'Chat';
    emptyState.classList.add('hidden');
    messagesList.innerHTML = '';

    data.messages.forEach(msg => {
      if (msg.role === 'user') {
        appendUserMessage(msg.content);
      } else if (msg.role === 'assistant') {
        appendAssistantMessage(msg.content, msg.meta?.sources || []);
      }
    });

    scrollToBottom();
    loadSessions();
  } catch (err) {
    console.error('Failed to load session:', err);
  }
}

async function deleteSession(sessionId) {
  try {
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    if (currentSessionId === sessionId) {
      startNewChat();
    } else {
      loadSessions();
    }
  } catch (err) {
    console.error('Failed to delete session:', err);
  }
}

function scrollToBottom() {
  const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 120;
  if (isNearBottom || isGenerating) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMarkdown(md) {
  if (window.marked && window.DOMPurify) {
    const rawHtml = window.marked.parse(md || '');
    return window.DOMPurify.sanitize(rawHtml);
  }
  return escapeHtml(md);
}

function appendUserMessage(text) {
  emptyState.classList.add('hidden');
  const row = document.createElement('div');
  row.className = 'message-wrapper user-row';
  row.innerHTML = `<div class="user-bubble">${escapeHtml(text)}</div>`;
  messagesList.appendChild(row);
  scrollToBottom();
}

function appendAssistantMessage(text, sources = []) {
  emptyState.classList.add('hidden');
  const row = document.createElement('div');
  row.className = 'message-wrapper assistant-row';

  let sourcesHtml = '';
  if (sources && sources.length > 0) {
    sourcesHtml = `
      <div class="sources-list">
        ${sources.map(s => `
          <a class="source-badge" href="${s.url}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(s.domain || 'source')} ${s.published_date ? '• ' + escapeHtml(s.published_date) : ''}
          </a>
        `).join('')}
      </div>
    `;
  }

  row.innerHTML = `
    <div class="assistant-body">${renderMarkdown(text)}</div>
    ${sourcesHtml}
  `;
  messagesList.appendChild(row);
  scrollToBottom();
}

// Stop generation button
stopBtn.addEventListener('click', () => {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  setGenerating(false);
});

function setGenerating(generating) {
  isGenerating = generating;
  if (generating) {
    sendBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    userInput.disabled = true;
  } else {
    sendBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    userInput.disabled = false;
    userInput.focus();
  }
}

// Form Submission & Streaming Handler
composerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text || isGenerating) return;

  if (!currentSessionId) {
    currentSessionId = `session_${Date.now()}`;
  }

  appendUserMessage(text);
  userInput.value = '';
  userInput.style.height = 'auto';
  setGenerating(true);

  // Assistant placeholder container
  const assistantRow = document.createElement('div');
  assistantRow.className = 'message-wrapper assistant-row';

  const statusContainer = document.createElement('div');
  statusContainer.className = 'search-status-bar';

  const bodyContainer = document.createElement('div');
  bodyContainer.className = 'assistant-body';
  bodyContainer.innerHTML = '<span class="cursor-caret"></span>';

  const sourcesContainer = document.createElement('div');
  sourcesContainer.className = 'sources-list hidden';

  assistantRow.appendChild(statusContainer);
  assistantRow.appendChild(bodyContainer);
  assistantRow.appendChild(sourcesContainer);
  messagesList.appendChild(assistantRow);
  scrollToBottom();

  activeAbortController = new AbortController();
  let fullText = '';
  let statusQueries = [];
  let collectedSources = [];

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentSessionId,
        message: text
      }),
      signal: activeAbortController.signal
    });

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep partial chunk

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr);

          if (event.type === 'status') {
            statusQueries.push(event.message);
            const chip = document.createElement('div');
            chip.className = 'status-chip';
            chip.textContent = event.message;
            statusContainer.appendChild(chip);
            scrollToBottom();
          } else if (event.type === 'token') {
            fullText += event.text;
            bodyContainer.innerHTML = renderMarkdown(fullText) + '<span class="cursor-caret"></span>';
            scrollToBottom();
          } else if (event.type === 'sources') {
            collectedSources = event.sources;
            if (collectedSources.length > 0) {
              sourcesContainer.classList.remove('hidden');
              sourcesContainer.innerHTML = collectedSources.map(s => `
                <a class="source-badge" href="${s.url}" target="_blank" rel="noopener noreferrer">
                  ${escapeHtml(s.domain || 'source')} ${s.published_date ? '• ' + escapeHtml(s.published_date) : ''}
                </a>
              `).join('');
            }
          } else if (event.type === 'done') {
            // Collapse search status chips into quiet summary
            if (statusQueries.length > 0) {
              statusContainer.innerHTML = `<div class="status-summary">Searched ${statusQueries.length} queries</div>`;
            }
            bodyContainer.innerHTML = renderMarkdown(event.text || fullText);
            loadSessions();
          } else if (event.type === 'error') {
            bodyContainer.innerHTML = `<span style="color:#cf4436;">Error: ${escapeHtml(event.message)}</span>`;
          }
        } catch {
          // ignore partial parse error
        }
      }
    }
  } catch (err) {
    if (activeAbortController?.signal.aborted) {
      bodyContainer.innerHTML = renderMarkdown(fullText) + ' <span style="color:var(--muted); font-size:12px;">(stopped)</span>';
    } else {
      bodyContainer.innerHTML = `<span style="color:#cf4436;">Connection error: ${escapeHtml(err.message)}</span>`;
    }
  } finally {
    setGenerating(false);
    activeAbortController = null;
    scrollToBottom();
  }
});

// Initial startup
startNewChat();
