import { spawn } from 'child_process';
import crypto from 'crypto';

delete process.env.FIXED_NOW;
process.env.PORT = '3006';
process.env.DEMO_SEED = '1';

console.log('Starting server with REAL clock (no FIXED_NOW)...');
const server = spawn('node', ['apps/server/src/index.js'], {
  env: { ...process.env, FIXED_NOW: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});

server.stdout.on('data', d => process.stdout.write(`[Server] ${d.toString()}`));
server.stderr.on('data', d => process.stderr.write(`[Server Err] ${d.toString()}`));

async function waitForServer(port, retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/api/v1/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

try {
  const ready = await waitForServer(3006);
  if (!ready) throw new Error('Server failed to start on port 3006');

  console.log('\n Server is healthy on port 3006 with real clock.');

  const clientId = '00000000-0000-0000-0000-000000000001';
  const sessionId = crypto.randomUUID();
  const testPrompt = 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?';

  console.log('\nCalling POST /api/v1/chat over HTTP with Example 3...');

  const response = await fetch('http://localhost:3006/api/v1/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': clientId
    },
    body: JSON.stringify({ message: testPrompt, sessionId })
  });

  console.log(`HTTP Status: ${response.status} ${response.statusText}\n`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n\n');
    buffer = lines.pop();

    for (const chunk of lines) {
      if (!chunk.trim()) continue;
      const eventMatch = chunk.match(/^event:\s*(.+)$/m);
      const dataMatch = chunk.match(/^data:\s*(.+)$/m);
      if (eventMatch && dataMatch) {
        const type = eventMatch[1].trim();
        let payload;
        try { payload = JSON.parse(dataMatch[1]); } catch { payload = dataMatch[1]; }

        if (type === 'token') {
          process.stdout.write(payload.text || '');
        } else {
          console.log(`\n[EVENT: ${type}]`, JSON.stringify(payload).slice(0, 160) + (JSON.stringify(payload).length > 160 ? '...' : ''));
        }
      }
    }
  }
  console.log('\n\n=== STREAM COMPLETED ===');
} finally {
  server.kill('SIGTERM');
  console.log('Server stopped.');
}
