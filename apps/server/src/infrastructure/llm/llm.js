import OpenAI from 'openai';
import { config } from '../../config/index.js';

export function getLlmClient(apiKey = config.llm.apiKey) {
  const baseURL = config.llm.baseURL;
  return new OpenAI({ apiKey: apiKey || 'dummy-key', baseURL, timeout: 30000 });
}

function safeParseJson(str) {
  if (!str || typeof str !== 'string') return {};
  try {
    return JSON.parse(str);
  } catch {
    try {
      return JSON.parse(str.trim().replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return { raw: str };
    }
  }
}

function finalizeToolCalls(accumulator) {
  return Object.values(accumulator).map(tc => ({
    id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
    name: tc.name,
    rawArguments: tc.rawArgs,
    arguments: safeParseJson(tc.rawArgs)
  }));
}

function getRetryDelay(err, attempt, baseMs = 1500) {
  if (err?.headers?.['retry-after']) {
    const s = parseInt(err.headers['retry-after'], 10);
    if (!isNaN(s) && s > 0) return s * 1000;
  }
  return baseMs * Math.pow(2, attempt - 1);
}

export async function* streamChat({ model, messages, tools = undefined, tool_choice = undefined, signal = undefined }) {
  const fastModel = config.llm.fastModel;
  const deepModel = config.llm.deepModel;
  let targetModel = model || deepModel;

  const client = getLlmClient();
  let attempt = 0;
  let hasFallenBack = false;

  while (attempt < 3) {
    attempt++;
    try {
      const payload = { model: targetModel, messages, stream: true };
      if (tools?.length) {
        payload.tools = tools;
        if (tool_choice) payload.tool_choice = tool_choice;
      }

      const stream = await client.chat.completions.create(payload, { signal });
      const toolMap = {};
      let finish = null;

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finish = choice.finish_reason;
        const delta = choice.delta;
        if (delta?.content) yield { type: 'text_delta', text: delta.content };
        if (Array.isArray(delta?.tool_calls)) {
          for (let i = 0; i < delta.tool_calls.length; i++) {
            const tc = delta.tool_calls[i];
            const idx = tc.index !== undefined ? tc.index : (tc.id || i);
            if (!toolMap[idx]) toolMap[idx] = { id: tc.id || '', name: tc.function?.name || '', rawArgs: '' };
            if (tc.id) toolMap[idx].id = tc.id;
            if (tc.function?.name) toolMap[idx].name = tc.function.name;
            if (tc.function?.arguments) toolMap[idx].rawArgs += tc.function.arguments;
          }
        }
      }

      const calls = finalizeToolCalls(toolMap);
      if (calls.length > 0) yield { type: 'tool_calls', toolCalls: calls };
      yield { type: 'finish_reason', finishReason: finish || 'stop' };
      return;
    } catch (err) {
      const is429 = err.status === 429 ||
        String(err.status) === '429' ||
        (err.message && (
          err.message.includes('429') ||
          err.message.toLowerCase().includes('rate limit') ||
          err.message.toLowerCase().includes('resource has been exhausted')
        ));
      if (is429 && targetModel === deepModel && !hasFallenBack && fastModel !== deepModel) {
        targetModel = fastModel;
        hasFallenBack = true;
        yield { type: 'fallback', model: fastModel, reason: 'Deep model rate limited; fell back to fast model.' };
        continue;
      }
      if ((is429 || (err.status >= 500 && err.status < 600)) && attempt < 4) {
        const delay = is429 ? Math.max(4000 * attempt, getRetryDelay(err, attempt)) : getRetryDelay(err, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}
