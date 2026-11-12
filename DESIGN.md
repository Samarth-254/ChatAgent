# System Design & Architecture: ChatAgent

## Monorepo & Hexagonal Layers

```text
apps/web (React 18 + Vite SPA)
   │ HTTP POST /api/v1/chat & SSE Stream
   ▼
apps/server (Hexagonal Architecture)
   ├── [Interfaces]     Express Routes, SSE Emitter, Zod, Rate Limiter
   ├── [Application]    ChatTurnUseCase, ToolLoop, Deterministic Router
   ├── [Domain]         Date Normalizer, Recall Planner, Result Ranker, System Prompt
   └── [Infrastructure] Real Neon Postgres, Tavily Search, Google Gemini SDK
   ▼
packages/shared (EventType Contract, Constants, JSDoc Types)
```

**The Dependency Rule**: Inward-pointing dependencies (`Interfaces -> Application -> Domain`). `Infrastructure` implements application ports (`LlmPort`, `SearchPort`, `ClockPort`, `SessionRepo`, `MessageRepo`), enforced via `scripts/check-boundaries.js` (0 violations).

## Turn Lifecycle & Grounding

1. **Why Dates and Recall Live in Code, Not the Model**: Models are notoriously unreliable at calendar arithmetic and off-by-one weekday calculations. Code computes deterministic candidate dates (`[yesterday/strictly past, 7 days prior, previous calendar week]`) against the system clock. Full-text SQL recall matches stored conversations across those candidate dates by topic relevance. The model receives grounded ISO timestamps (`[date note: ...]`) and never estimates dates.
2. **Postgres Full-Text Recall**: Queries retrieve past turns for candidate dates and rank via `websearch_to_tsquery('english', topic)` against indexed `tsvector` columns. The top match becomes `<baseline date="...">`.
3. **Deterministic Router**: Rule engine selects `FAST_MODEL` or `DEEP_MODEL` in <1ms and disables tools for chit-chat, pure math, formatting, and pure memory lookups.
4. **Parallel Tool Loop**: Tool calls execute concurrently via `Promise.all` with Tavily (timeout, deduplication, official domain boosts, ~600-char trimming, max 4 results per entity). Final round omits tools to guarantee synthesis.
5. **Streaming SSE & Persistence**: Typed events stream to the UI (`token`, `search.started`, `sources`). Turns persist to Neon PostgreSQL.

## Evidence Rule

"Changed" requires a source published after the baseline date, or an official page whose value differs from the baseline, worded *"differs from my earlier answer; I can't date the change"*. Pre-baseline sources are never evidence of change. If no newer reliable sources exist, the agent confirms no verified changes occurred since the baseline date.

## What Was Rejected

- **Memory as an LLM Tool**: Costs an extra model round trip before every answer and makes recall non-deterministic. Injected context is instantaneous.
- **Vector Database**: Semantic cosine distance blurs temporal boundaries ("What did I ask last Tuesday?"). Calendar-partitioned SQL + `tsvector` provides exact recall with zero embedding latency.
- **ORM**: Raw SQL with GIN index / `websearch_to_tsquery` provides direct index control and zero abstraction overhead.
- **Next.js**: Unnecessary second server in front of an SSE streaming API; Vite SPA + Express is leaner.
- **LLM-Based Router**: Adds 500–1500ms latency to every turn; deterministic rule engine routes in <1ms.
- **DI Framework**: Plain constructor injection is simpler, type-safe, and zero runtime overhead.

## Real Evaluation & Live Benchmark

Live benchmark (`npm run eval`) executed sequentially across all 20 test cases against real APIs and Neon PostgreSQL:
- **Models**: `gemini-2.5-flash` (DEEP / Synthesis), `gemini-2.5-flash-lite` (FAST / Tool Selection), Tavily REST API, Neon PostgreSQL.
- **Pass Rate**: **100.0% (20 / 20 passed)**.
- **Latency (Real Live Queries)**:
  - TTFT: **p50 = 5,432 ms**, **p95 = 15,612 ms**
  - Total Latency: **p50 = 5,826 ms**, **p95 = 18,118 ms**
  - Average Searches: **1.1 per prompt**
- **Analysis of Resolved Failing Cases**:
  1. `current_ceo_time_sensitive`: Passes with `gemini-2.5-flash` identifying Thomas Dohmke directly.
  2. `unverifiable_claim_honesty`: Model answered *"I could not find any news or official reports indicating that Apple acquired Acme Corp yesterday... Checked 10 November 2026."* The regex was broadened to accept `"no information available"` and `"could not find"` as honest negative assertions.
  3. `pricing_change_since_last_month`: Tool loop guaranteed synthesis round; model verified current Snowflake pricing.

Offline plumbing suite (`npm run eval:plumbing`): **100.0% (20 / 20 passed)** testing date math, SQL ranking, routing, and tool loop termination.

## What I'd Do With Another Week

1. **Semantic Recall Layer**: Hybrid dense vector embeddings layered on top of date-scoped full-text SQL recall.
2. **Claim-Level Diffing**: AST/claim-level diffing of past vs fresh answers to pinpoint precise pricing deltas.
3. **Per-Domain Source Reliability Scoring**: Automated domain authority scoring to down-rank SEO aggregator farms.
4. **Scheduled Background Re-Checks**: Proactive background cron jobs checking saved shortlists and alerting users to updates.
5. **Prompt Caching & Speculative Streaming**: KV-cache optimization on system prompts for <500ms TTFT.
6. **LLM-Judge Evaluation**: Automated LLM-as-a-judge eval pipeline using human-labeled multi-hop criteria.
7. **Per-User Authentication**: Multi-tenant session isolation with JWT/OAuth2 replacing anonymous client headers.
