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

**The Dependency Rule**: Dependencies point strictly inward: `Interfaces -> Application -> Domain`. `Infrastructure` implements application ports (`LlmPort`, `SearchPort`, `ClockPort`, `SessionRepo`, `MessageRepo`). Verified via `scripts/check-boundaries.js`.

## Turn Lifecycle

1. **Date Grounding**: Server normalizes relative dates against real system clock into candidate arrays (`[strictly past, 7 days prior, previous calendar week]`). A canonical `[date note: ...]` is appended. The model never estimates dates.
2. **Postgres Full-Text Recall**: Queries retrieve past turns for candidate dates and rank via `websearch_to_tsquery('english', topic)` against indexed `tsvector` columns. The top match becomes `<baseline date="...">`.
3. **Deterministic Router**: Rule engine selects `FAST_MODEL` or `DEEP_MODEL` in <1ms and forces `tool_choice: "required"` when research signals exist.
4. **Parallel Tool Loop**: Tool calls execute concurrently via `Promise.all` with Tavily (timeout, deduplication, official domain boosts, ~600-char trimming, max 4 results per entity).
5. **Streaming SSE**: Emits typed events (`turn.started`, `status.update`, `date.resolved`, `search.started`, `token`, `sources`, `turn.completed`).
6. **Persistence**: The completed turn, citations, and latencies persist to Neon PostgreSQL.

## What Was Rejected

- **Vector Database**: Semantic cosine distance blurs temporal boundaries ("What did I ask last Tuesday?"). Calendar-partitioned SQL + `tsvector` provides exact recall with zero embedding latency.
- **Memory as an LLM Tool**: Disallowed by challenge constraints (single tool: `web_search`) and wastes 1–2s on an extra LLM round-trip. Injected context is instantaneous.
- **Multi-Agent / Planner Chains**: Multiply latency and token cost 3–5x. A lean single-loop agent with parallel execution is faster and more reliable.

## Real Eval (Live)

Live benchmark (`npm run eval`) executed sequentially across all 20 test cases against real APIs and Neon PostgreSQL:
- **Models**: `gemini-3.5-flash` (DEEP / Synthesis), `gemini-3.5-flash-lite` (FAST / Tool Selection), Tavily REST API, Neon PostgreSQL.
- **Pass Rate**: **85.0% (17 / 20 passed)**.
- **Latency (Real Live Queries)**:
  - TTFT: **p50 = 10,417 ms**, **p95 = 21,653 ms**
  - Total Latency: **p50 = 11,645 ms**, **p95 = 24,803 ms**
  - Average Searches: **1.4 per prompt**
- **Core Challenge Prompts Performance (All Passed)**:
  - *Example 1 (5 CRM shortlist since Monday)*: TTFT 22.6s, Total 24.8s (5 parallel searches).
  - *Example 2 (Recall 3 Nov Q&A & re-verify)*: TTFT 10.4s, Total 11.8s (3 parallel searches).
  - *Example 3 (Last Tuesday Postgres pricing re-verification)*: TTFT 12.3s, Total 14.5s (4 parallel searches).
- **Failed Cases & Analysis (3 / 20)**:
  1. `current_ceo_time_sensitive`: Model cited Thomas Dohmke's leadership in narrative prose but omitted the exact regex pattern token in the final summary line.
  2. `unverifiable_claim_honesty`: Model answered that a fictitious event could not be confirmed, but used phrasing "no records found in news" instead of exact regex token `couldn't verify`.
  3. `pricing_change_since_last_month`: Model reported Snowflake's latest consumption pricing without explicitly outputting the word "pricing" in the heading.

## Plumbing Tests

Offline validation suite (`npm run eval:plumbing`) with deterministic fakes over real Neon PostgreSQL:
- **Scope**: Tests relative date arithmetic, candidate resolution, full-text SQL tsvector ranking, router rules, and tool loop termination. Not model quality. Never quote plumbing latency as model performance.
- **Pass Rate**: **100.0% (20 / 20 passed)**.
