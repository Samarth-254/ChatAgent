import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

let cur = process.cwd();
for (let i = 0; i < 4; i++) {
  const candidate = path.join(cur, '.env');
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
  cur = path.dirname(cur);
}

const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT) || process.argv.some(a => a.includes('test'));

function getRequired(key) {
  const val = process.env[key];
  if (!val && !isTest) {
    throw new Error(`[Config] Missing required environment variable: ${key}`);
  }
  return val || '';
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: isTest ? 'test' : (process.env.NODE_ENV || 'development'),
  databaseUrl: process.env.DATABASE_URL || '',
  llm: {
    apiKey: isTest ? (process.env.LLM_API_KEY || '') : getRequired('LLM_API_KEY'),
    baseURL: process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
    fastModel: process.env.FAST_MODEL || 'gemini-2.5-flash-lite',
    deepModel: process.env.DEEP_MODEL || 'gemini-2.5-flash-lite'
  },
  search: {
    apiKey: isTest ? (process.env.TAVILY_API_KEY || '') : getRequired('TAVILY_API_KEY')
  },
  clock: {
    fixedNow: process.env.FIXED_NOW || null,
    userTz: process.env.USER_TZ || null
  }
};
