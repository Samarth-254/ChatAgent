import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

import { createDb } from '../../infrastructure/storage/postgres/createDb.js';
import { runMigrations } from '../../infrastructure/storage/postgres/migrationRunner.js';
import { PostgresSessionRepository } from '../../infrastructure/storage/postgres/postgresSessionRepository.js';
import { PostgresMessageRepository } from '../../infrastructure/storage/postgres/postgresMessageRepository.js';
import { Clock } from '../../infrastructure/clock/clock.js';
import { TavilySearchClient } from '../../infrastructure/search/search.js';
import { OpenAiLlmClient } from '../../infrastructure/llm/llm.js';
import { Router } from '../../application/router.js';
import { SystemPromptBuilder } from '../../application/prompts.js';
import { ChatTurnUseCase } from '../../application/chatTurnUseCase.js';

async function main() {
  console.log('\n===========================================');
  console.log('   ChatAgent Terminal REPL');
  console.log('   Type your message or /exit to quit');
  console.log('===========================================\n');

  const db = await createDb();
  await runMigrations(db);

  const sessionRepo = new PostgresSessionRepository(db);
  const messageRepo = new PostgresMessageRepository(db);
  const clock = new Clock();
  const searchClient = new TavilySearchClient();
  const llmClient = new OpenAiLlmClient();
  const router = new Router();
  const promptBuilder = new SystemPromptBuilder();

  const useCase = new ChatTurnUseCase({
    sessionRepo,
    messageRepo,
    clock,
    searchClient,
    llmClient,
    router,
    promptBuilder,
  });

  const userId = randomUUID();
  let sessionId = randomUUID();

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
        const stream = useCase.execute({
          userId,
          sessionId,
          message: trimmed,
        });

        for await (const event of stream) {
          if (event.event === 'chunk' && event.data?.delta) {
            process.stdout.write(event.data.delta);
          } else if (event.event === 'status' && event.data?.step === 'searching') {
            process.stdout.write(`\n[searching: ${event.data.query || 'web'}...]\nAgent > `);
          }
        }
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
