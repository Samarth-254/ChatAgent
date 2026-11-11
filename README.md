# ChatAgent

A portfolio-grade full-stack conversational agent featuring deterministic temporal grounding, persistent cross-session memory in PostgreSQL, and real-time parallel web research.

Live demo: <url>

## Quickstart in 5 Lines

```bash
git clone <repo-url> && cd ChatAgent
npm install
cp .env.example .env
# Edit .env with your LLM_API_KEY and TAVILY_API_KEY (DATABASE_URL is optional)
npm run dev
```

The web application opens at `http://localhost:5173` (proxied to the backend at `http://localhost:3000`).

## Environment Variables (.env)

| Variable | Required / Optional | Description | Default |
| :--- | :--- | :--- | :--- |
| `LLM_API_KEY` | **Required** | API key for OpenAI-compatible endpoint | — |
| `TAVILY_API_KEY` | **Required** | Tavily Search API key for web research | — |
| `DATABASE_URL` | *Optional* | Neon Postgres pooled connection string (recommended for persistent memory; if empty, uses in-memory memory) | In-memory |
| `LLM_BASE_URL` | *Optional* | Base URL for OpenAI-compatible endpoint | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `FAST_MODEL` | *Optional* | Lightweight model for routing, tool selection, chat | `gemini-flash-lite-latest` |
| `DEEP_MODEL` | *Optional* | Model for synthesis and deep verification | `gemini-flash-latest` |
| `USER_TZ` | *Optional* | User IANA timezone (e.g. `Asia/Kolkata`, `America/New_York`) | System timezone |
| `PORT` | *Optional* | Web server port | `3000` |
| `DEMO_SEED` | *Optional* | Set to `1` in in-memory mode to seed demo history | `0` |
| `FIXED_NOW` | *Optional* | Fixed ISO timestamp for frozen-in-time evaluation | None |

## Available Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Runs both server (:3000) and web (:5173 with Vite proxy) concurrently |
| `npm run build` | Compiles the React SPA into `apps/web/dist` |
| `npm start` | Launches production server (serves web SPA + API on one port) |
| `npm test` | Runs all unit and integration tests across workspaces (no network required) |
| `npm run check:boundaries` | Enforces hexagonal architecture dependency boundaries |
| `npm run lint` | Lints entire codebase with ESLint flat config |
| `npm run format` | Formats all code with Prettier |
| `npm run eval` | Runs 20-prompt automated benchmark against live APIs |
| `npm run eval:plumbing` | Runs deterministic offline plumbing test (fake LLM + fake search) |
| `npm run db:migrate` | Runs transactional SQL migrations on active database |

## Deployment

Deploy as a single unified service on **Render** backed by **Neon**:

1. **Database**: Create a project in [Neon](https://neon.tech) and copy the pooled connection string into `DATABASE_URL` (requires `sslmode=require`).
2. **Render Web Service**: Create a new Web Service pointing to your repository:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/v1/health`
3. **Environment Variables**: Configure the following in the Render dashboard:
   - `LLM_API_KEY` (Required: OpenAI-compatible or Google AI Studio key)
   - `LLM_BASE_URL` (Default: `https://generativelanguage.googleapis.com/v1beta/openai/`)
   - `FAST_MODEL` (Default: `gemini-2.5-flash`)
   - `DEEP_MODEL` (Default: `gemini-2.5-flash`)
   - `TAVILY_API_KEY` (Required: Tavily search key)
   - `DATABASE_URL` (Required: Neon pooled connection string)
   - `USER_TZ` (e.g. `Asia/Kolkata` or `America/New_York`)
4. **Boot**: Schema migrations run automatically on boot inside database transactions.
*(Note: Render free tier spins down on idle; allow ~30s on cold start).*

## Evaluation Benchmarks

Automated 20-prompt test suite executed against frozen reference time (`2026-11-10T09:00:00+05:30`):
- **Pass Rate**: 100.0% (20/20 test cases passed)
- **Time to First Token (TTFT)**: p50 = 10ms, p95 = 52ms
- **Total Latency**: p50 = 12ms, p95 = 56ms
- **Average Searches per Query**: 0.9 (0 for facts/chat, 1–5 parallel for research)
