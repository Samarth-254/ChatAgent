import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { EventType } from '@chatagent/shared';

import { streamChat } from '../../infrastructure/llm/llm.js';
import { search } from '../../infrastructure/search/search.js';
import * as clock from '../../infrastructure/clock/clock.js';
import { createDb } from '../../infrastructure/storage/postgres/createDb.js';
import { runMigrations } from '../../infrastructure/storage/postgres/migrationRunner.js';
import { PostgresSessionRepository } from '../../infrastructure/storage/postgres/postgresSessionRepository.js';
import { PostgresMessageRepository } from '../../infrastructure/storage/postgres/postgresMessageRepository.js';
import { ChatTurnUseCase } from '../../application/chatTurnUseCase.js';

async function main() {
  console.log('\n===========================================');
  console.log('   ChatAgent Terminal REPL');
  console.log('   Type your message or /exit to quit');
  console.log('===========================================\n');

  const db = createDb();
  await runMigrations(db);

  const sessionRepository = new PostgresSessionRepository(db);
  const messageRepository = new PostgresMessageRepository(db);
  const useCase = new ChatTurnUseCase({
    sessionRepository,
    messageRepository,
    llmPort: { streamChat },
    searchPort: { search },
    clockPort: clock
  });

  const userId = randomUUID();
  await sessionRepository.ensureUser(userId);
  const sessionId = randomUUID();
  await sessionRepository.createSession(sessionId, userId, 'Terminal Session');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = () => {
    rl.question('\nYou > ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        promptUser();
        return;
      }
      if (trimmed === '/exit' || trimmed === 'exit') {
        await db.close();
        rl.close();
        process.exit(0);
      }

      process.stdout.write('\nAgent > ');

      try {
        await useCase.execute({
          userId,
          sessionId,
          message: trimmed,
          onEvent: (event) => {
            if (event.type === EventType.TOKEN && event.payload?.text) {
              process.stdout.write(event.payload.text);
            } else if (event.type === EventType.SEARCH_STARTED && event.payload?.query) {
              process.stdout.write(`\n[searching: ${event.payload.query}...]\nAgent > `);
            }
          }
        });
        console.log('');
      } catch (err) {
        console.error('\nError:', err.message);
      }

      promptUser();
    });
  };

  promptUser();
}

main().catch((err) => {
  console.error('Fatal CLI error:', err);
  process.exit(1);
});
