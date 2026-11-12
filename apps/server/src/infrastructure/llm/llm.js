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
  return Object.values(accumulator).map(tc => {
    const item = {
      id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
      name: tc.name,
      rawArguments: tc.rawArgs,
      arguments: safeParseJson(tc.rawArgs)
    };
    if (tc.extra_content) {
      item.extra_content = tc.extra_content;
    }
    return item;
  });
}

function getRetryDelay(err, attempt, baseMs = 1500) {
  if (err?.headers?.['retry-after']) {
    const s = parseInt(err.headers['retry-after'], 10);
    if (!isNaN(s) && s > 0) return s * 1000;
  }
  return baseMs * Math.pow(2, attempt - 1);
}

export const GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

export async function* streamChat({
  model,
  messages,
  tools = undefined,
  tool_choice = undefined,
  signal = undefined,
  reasoningEffort = config.llm.reasoningEffort
}) {
  const client = getLlmClient();

  // Find starting index in strictly ordered GEMINI_MODELS
  let modelIndex = GEMINI_MODELS.indexOf(model);
  if (modelIndex === -1) {
    modelIndex = 0;
  }

  let lastErr = null;

  while (modelIndex < GEMINI_MODELS.length) {
    const targetModel = GEMINI_MODELS[modelIndex];
    let attempt = 0;
    const maxAttemptsPerModel = 2;

    while (attempt < maxAttemptsPerModel) {
      attempt++;
      try {
        const payload = { model: targetModel, messages, stream: true };
        if (reasoningEffort) {
          payload.reasoning_effort = reasoningEffort;
        }
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
              if (!toolMap[idx]) toolMap[idx] = { id: tc.id || '', name: tc.function?.name || '', rawArgs: '', extra_content: tc.extra_content };
              if (tc.id) toolMap[idx].id = tc.id;
              if (tc.extra_content) toolMap[idx].extra_content = tc.extra_content;
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
        lastErr = err;
        const isFallbackTrigger = err.status === 429 ||
          String(err.status) === '429' ||
          err.status === 404 ||
          err.status === 400 ||
          err.status === 503 ||
          (err.message && (
            err.message.includes('429') ||
            err.message.toLowerCase().includes('rate limit') ||
            err.message.toLowerCase().includes('resource has been exhausted') ||
            err.message.toLowerCase().includes('not found') ||
            err.message.toLowerCase().includes('timeout')
          ));

        if (isFallbackTrigger && modelIndex < GEMINI_MODELS.length - 1) {
          modelIndex++;
          const nextModel = GEMINI_MODELS[modelIndex];
          yield {
            type: 'fallback',
            model: nextModel,
            reason: `${targetModel} failed (${err.status || err.message}); falling back to next Gemini model: ${nextModel}.`
          };
          break; // break inner attempt loop to try next model in GEMINI_MODELS
        }

        if (attempt < maxAttemptsPerModel && (err.status >= 500 && err.status < 600)) {
          await new Promise(r => setTimeout(r, getRetryDelay(err, attempt)));
          continue;
        }

        if (modelIndex < GEMINI_MODELS.length - 1) {
          modelIndex++;
          const nextModel = GEMINI_MODELS[modelIndex];
          yield {
            type: 'fallback',
            model: nextModel,
            reason: `${targetModel} encountered error; falling back to next Gemini model: ${nextModel}.`
          };
          break;
        }

        throw err;
      }
    }
  }

  if (lastErr) throw lastErr;
}
