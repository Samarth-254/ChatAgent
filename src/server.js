import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAgent } from './agent.js';
import { getSessions, getSession, deleteSession, createSession } from './memory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Fail fast on missing keys if running without mock mode
function validateEnv() {
  if (process.env.MOCK_LLM !== '1' && process.env.NODE_ENV !== 'test') {
    if (!process.env.LLM_API_KEY) {
      console.error('\n❌ ERROR: Missing required environment variable: LLM_API_KEY');
      console.error('Please configure your LLM_API_KEY in .env or provide it in your environment.\n');
      process.exit(1);
    }
  }
}

validateEnv();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Serve local browser vendor scripts without CDN
app.get('/vendor/marked.js', (req, res) => {
  res.sendFile(path.join(rootDir, 'node_modules/marked/lib/marked.umd.js'));
});

app.get('/vendor/purify.js', (req, res) => {
  res.sendFile(path.join(rootDir, 'node_modules/dompurify/dist/purify.min.js'));
});

// Serve public static frontend
app.use(express.static(path.join(rootDir, 'public')));

// Sessions API
app.get('/api/sessions', (req, res) => {
  try {
    const sessions = getSessions();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sessions/:id', (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', (req, res) => {
  try {
    deleteSession(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chat SSE endpoint
app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing message parameter' });
  }

  const sid = sessionId || `session_${Date.now()}`;
  createSession(sid, message.slice(0, 36) + (message.length > 36 ? '...' : ''));

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    await runAgent({
      sessionId: sid,
      userMessage: message,
      signal: abortController.signal,
      onEvent: (event) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      }
    });
  } catch (err) {
    if (!abortController.signal.aborted && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
});

app.listen(port, () => {
  console.log(`\n🚀 ChatAgent server running at http://localhost:${port}`);
  console.log(`   Model configuration:`);
  console.log(`   - Fast Model: ${process.env.FAST_MODEL || 'gemini-3.5-flash-lite'}`);
  console.log(`   - Deep Model: ${process.env.DEEP_MODEL || 'gemini-3.5-flash'}`);
  console.log(`   - Timezone:   ${process.env.USER_TZ || 'system'}\n`);
});
