import 'dotenv/config';
import readline from 'readline';
import { runAgent } from './agent.js';
import { createSession } from './memory.js';

if (process.env.MOCK_LLM !== '1' && !process.env.LLM_API_KEY) {
  console.error('\n❌ ERROR: Missing required environment variable: LLM_API_KEY');
  console.error('Please configure your LLM_API_KEY in .env or provide it in your environment.\n');
  process.exit(1);
}

const sessionId = `cli_${Date.now()}`;
createSession(sessionId, 'Terminal Chat');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n======================================================');
console.log('   ChatAgent Terminal CLI (type "exit" to quit)');
console.log('======================================================\n');

function prompt() {
  rl.question('\nYOU > ', async (input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      prompt();
      return;
    }
    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
      console.log('\nGoodbye!\n');
      rl.close();
      process.exit(0);
    }

    process.stdout.write('\nAGENT > ');
    let sourcesReceived = [];

    try {
      await runAgent({
        sessionId,
        userMessage: trimmed,
        onEvent: (event) => {
          if (event.type === 'token') {
            process.stdout.write(event.text);
          } else if (event.type === 'status') {
            process.stdout.write(`\n\x1b[90m[${event.message}]\x1b[0m\nAGENT > `);
          } else if (event.type === 'sources') {
            sourcesReceived = event.sources;
          } else if (event.type === 'error') {
            console.error(`\n\x1b[31mError: ${event.message}\x1b[0m`);
          }
        }
      });

      if (sourcesReceived.length > 0) {
        console.log('\n\n\x1b[90mSources:');
        for (const s of sourcesReceived) {
          console.log(` - ${s.title || s.domain} (${s.domain}, pub: ${s.published_date || 'unknown'}) -> ${s.url}`);
        }
        console.log('\x1b[0m');
      } else {
        console.log('');
      }
    } catch (err) {
      console.error(`\n\x1b[31mAgent execution error: ${err.message}\x1b[0m`);
    }

    prompt();
  });
}

prompt();
