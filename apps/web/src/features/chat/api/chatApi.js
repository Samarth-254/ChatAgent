import { getAuthHeaders } from '../../../lib/clientId.js';

export async function streamChatQuery({ sessionId, message, signal, onEvent }) {
  const response = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ sessionId, message }),
    signal
  });

  if (!response.ok) {
    let errorMsg = `Server error HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.error?.message || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      if (!block.trim()) continue;
      const lines = block.split('\n');
      let currentEvent = 'message';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData += line.slice(6);
        }
      }

      if (currentData) {
        try {
          const payload = JSON.parse(currentData);
          onEvent({ type: currentEvent, payload });
        } catch {}
      }
    }
  }
}

