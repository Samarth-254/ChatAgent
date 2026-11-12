import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { config } from './config/index.js';
import { streamChat } from './infrastructure/llm/llm.js';
import { search } from './infrastructure/search/search.js';
import * as clock from './infrastructure/clock/clock.js';
import { createDb } from './infrastructure/storage/postgres/createDb.js';
import { runMigrations } from './infrastructure/storage/postgres/migrationRunner.js';
import { PostgresSessionRepository } from './infrastructure/storage/postgres/postgresSessionRepository.js';
import { PostgresMessageRepository } from './infrastructure/storage/postgres/postgresMessageRepository.js';
import { InMemorySessionRepository, InMemoryMessageRepository, seedDemoHistory } from './infrastructure/storage/inMemory/inMemoryRepositories.js';
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

// Fail fast on missing keys in live runtime
if (config.nodeEnv !== 'test') {
  if (!config.llm.apiKey) {
    console.error('\n❌ ERROR: Missing required environment variable: LLM_API_KEY');
    console.error('Please configure LLM_API_KEY in your .env file or environment.\n');
    process.exit(1);
  }
  if (!config.search.apiKey) {
    console.error('\n❌ ERROR: Missing required environment variable: TAVILY_API_KEY');
    console.error('Please configure TAVILY_API_KEY in your .env file or environment.\n');
    process.exit(1);
  }
}

const app = express();
const port = config.port;

app.use(helmet({
  contentSecurityPolicy: false
}));

// CORS enabled only in dev for standalone testing; production is same-origin
if (config.nodeEnv === 'development') {
  app.use(cors());
}

app.use(express.json({ limit: '1mb' }));

// Initialize Database & Repositories
let db = null;
let sessionRepository;
let messageRepository;

if (config.databaseUrl) {
  db = createDb();
  await runMigrations(db);
  sessionRepository = new PostgresSessionRepository(db);
  messageRepository = new PostgresMessageRepository(db);
} else {
  console.warn('\n⚠️  ******************************************************************');
  console.warn('⚠️  No DATABASE_URL: using in-memory memory, history is lost on restart.');
  console.warn('⚠️  ******************************************************************\n');
  sessionRepository = new InMemorySessionRepository();
  messageRepository = new InMemoryMessageRepository(sessionRepository);

  if (process.env.DEMO_SEED === '1') {
    await seedDemoHistory(sessionRepository, messageRepository);
  }
}

const chatTurnUseCase = new ChatTurnUseCase({
  sessionRepository,
  messageRepository,
  llmPort: { streamChat },
  searchPort: { search },
  clockPort: clock,
  fastModel: config.llm.fastModel,
  deepModel: config.llm.deepModel
});

// Health check (unauthenticated)
app.use('/api/v1/health', createHealthRouter({ db }));

// Authenticated API routes
const apiRouter = express.Router();
apiRouter.use(clientAuthMiddleware);
apiRouter.use('/chat', createChatRouter({ chatTurnUseCase, sessionRepository }));
apiRouter.use('/sessions', createSessionsRouter({ sessionRepository, messageRepository }));
apiRouter.use('/memory', createMemoryRouter({ messageRepository }));

app.use('/api/v1', apiRouter);

// Production static file serving for web frontend + SPA fallback
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
  console.log(`   Database:    ${db ? db.type.toUpperCase() : 'IN-MEMORY (History lost on restart)'}`);
  console.log(`   Fast Model:  ${config.llm.fastModel}`);
  console.log(`   Deep Model:  ${config.llm.deepModel}`);
  console.log(`   User TZ:     ${config.clock.userTz || 'system'}\n`);
});

const shutdown = async () => {
  console.log('\nShutting down gracefully...');
  server.close(async () => {
    if (db) await db.close();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app, server, db };
