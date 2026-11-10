# ChatAgent

A high-performance, date-aware chat agent with cross-session memory, automated historical baseline re-verification, and live web search.

## Quickstart in 5 Lines

```bash
git clone <repo-url> && cd ChatAgent
npm install
cp .env.example .env
# Add your LLM_API_KEY and TAVILY_API_KEY in .env
npm run dev
```

Open `http://localhost:3000` in your browser.

## Running Modes

- **Web UI**: `npm run dev` (starts server with hot reload at `http://localhost:3000`)
- **Terminal CLI**: `npm run chat` (interactive streaming REPL in your console)
- **Evaluation Runner**: `npm run eval` (runs 20 automated test cases with machine-checkable assertions)

## Environment Variables (.env)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `LLM_API_KEY` | API key for OpenAI-compatible LLM endpoint (Gemini, Groq, Ollama, etc.) | Required |
| `LLM_BASE_URL` | Base URL for chat completions | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `FAST_MODEL` | Lightweight model for chit-chat, math, and stable facts | `gemini-3.5-flash-lite` |
| `DEEP_MODEL` | Reasoning model for deep research and live baseline verification | `gemini-3.5-flash` |
| `TAVILY_API_KEY`| Tavily Search API key | Required for live search |
| `USER_TZ` | User IANA timezone (e.g. `Asia/Kolkata`, `America/New_York`) | System timezone |
| `PORT` | Web server port | `3000` |
| `FIXED_NOW` | Optional ISO timestamp used by the evaluation harness to freeze time | None |

### Provider Alternatives

ChatAgent is completely provider-agnostic. To use Groq instead:
```env
LLM_BASE_URL=https://api.groq.com/openai/v1
FAST_MODEL=llama-3.1-8b-instant
DEEP_MODEL=llama-3.3-70b-versatile
```

## Example Prompts

Try the three core evaluation prompts:

1. *"On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?"*
   - Resolves "Monday" to a concrete date, retrieves the historical shortlist from SQLite, executes 5 parallel searches for pricing and changelog updates with `after_date`, and returns a structured breakdown (*Changed since* / *No change found*).
2. *"What did I ask you on 3 November? Is your answer still correct today?"*
   - Retrieves the verbatim question asked on 3 November, searches fresh sources, and explicitly validates whether the historical answer remains accurate today.
3. *"Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"*
   - Resolves "Last Tuesday", establishes the baseline recommendation, and re-checks official pricing pages for changes.
