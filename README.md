# ChatAgent

A portfolio-grade full-stack conversational agent featuring deterministic temporal grounding, persistent cross-session memory in PostgreSQL, and real-time parallel web research.

## Quickstart in 5 Lines

```bash
git clone <repo-url> && cd ChatAgent
npm install
cp .env.example .env
# Edit .env with your LLM_API_KEY and TAVILY_API_KEY
npm run dev
```

The web application will open at `http://localhost:5173` (proxied to the backend at `http://localhost:3000`).

## Monorepo Architecture

```text
ChatAgent/
├── apps/
│   ├── server/           # Hexagonal Node + Express API & Agent Core
│   └── web/              # React 18 + Vite SPA (Claude aesthetic, CSS variables)
├── packages/
│   └── shared/           # Shared SSE event contract, types, and constants
└── scripts/              # Boundary checking and maintenance scripts
```

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
| `npm run eval` | Runs full 20-prompt automated benchmark against live APIs |
| `npm run eval:mock` | Runs deterministic offline benchmark against simulated services |
| `npm run db:migrate` | Runs transactional SQL migrations on active database |

## Environment Variables (.env)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `LLM_API_KEY` | API key for OpenAI-compatible endpoint | Required |
| `LLM_BASE_URL` | Base URL for LLM chat completions | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `FAST_MODEL` | Lightweight model for general knowledge, chat, and math | `gemini-2.5-flash` |
| `DEEP_MODEL` | Reasoning model for deep research and live verification | `gemini-2.5-flash` |
| `TAVILY_API_KEY` | Tavily Search API key | Required for live search |
| `DATABASE_URL` | Neon Postgres connection string | If empty, runs embedded PGlite in `data/pglite` |
| `USER_TZ` | User IANA timezone (e.g. `Asia/Kolkata`, `America/New_York`) | `Asia/Kolkata` |
| `PORT` | Production server port | `3000` |
| `FIXED_NOW` | Optional ISO timestamp used to freeze time during evaluations | None |

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
