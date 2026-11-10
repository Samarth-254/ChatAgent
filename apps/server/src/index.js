import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { createDb } from './infrastructure/storage/postgres/createDb.js';
import { runMigrations } from './infrastructure/storage/postgres/migrationRunner.js';
import { PostgresSessionRepository } from './infrastructure/storage/postgres/postgresSessionRepository.js';
import { PostgresMessageRepository } from './infrastructure/storage/postgres/postgresMessageRepository.js';
import { ChatTurnUseCase } from './application/chatTurnUseCase.js';

import { clientAuthMiddleware } from './interfaces/http/middleware/auth.js';
import { errorHandler } from './interfaces/http/middleware/errorHandler.js';
import { createChatRouter } from './interfaces/http/routes/chat.js';
import { createSessionsRouter } from './interfaces/http/routes/sessions.js';
import { createMemoryRouter } from './interfaces/http/routes/memory.js';
import { createHealthRouter } from './interfaces/http/routes/health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../');
const webDistDir = path.join(rootDir, 'apps/web/dist');

// Fail fast on missing keys in live production mode
if (process.env.MOCK_LLM !== '1' && process.env.NODE_ENV !== 'test' && !process.env.LLM_API_KEY) {
  console.error('\n❌ ERROR: Missing required environment variable: LLM_API_KEY');
  console.error('Please configure LLM_API_KEY in your .env file or environment.\n');
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: false // Allow inline styles and Vite dev assets
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Initialize Database & Repositories
const db = createDb();
await runMigrations(db);

const sessionRepository = new PostgresSessionRepository(db);
const messageRepository = new PostgresMessageRepository(db);
const chatTurnUseCase = new ChatTurnUseCase({ sessionRepository, messageRepository });

// Health check (unauthenticated)
app.use('/api/v1/health', createHealthRouter({ db }));

// Authenticated API routes
const apiRouter = express.Router();
apiRouter.use(clientAuthMiddleware);
apiRouter.use('/chat', createChatRouter({ chatTurnUseCase, sessionRepository }));
apiRouter.use('/sessions', createSessionsRouter({ sessionRepository }));
apiRouter.use('/memory', createMemoryRouter({ messageRepository }));

app.use('/api/v1', apiRouter);

// Production static file serving for web frontend
if (fs.existsSync(webDistDir)) {
  app.use(express.static(webDistDir, { maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDistDir, 'index.html'));
  });
}

app.use(errorHandler);

const server = app.listen(port, () => {
  console.log(`\n🚀 ChatAgent server listening at http://localhost:${port}`);
  console.log(`   Database:    ${db.type.toUpperCase()}`);
  console.log(`   Fast Model:  ${process.env.FAST_MODEL || 'gemini-2.5-flash'}`);
  console.log(`   Deep Model:  ${process.env.DEEP_MODEL || 'gemini-2.5-flash'}`);
  console.log(`   User TZ:     ${process.env.USER_TZ || 'system'}\n`);
});

const shutdown = async () => {
  console.log('\nShutting down gracefully...');
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app, server, db };

