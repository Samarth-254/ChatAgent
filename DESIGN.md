# System Design & Architecture: ChatAgent

## Monorepo & Layer Topology

```text
+-------------------------------------------------------------------------+
| apps/web: React 18 + Vite (Hooks, Reducer, TanStack Query, CSS Modules) |
+-------------------------------------------------------------------------+
                                    │ HTTP / SSE (/api/v1/*)
                                    ▼
+-------------------------------------------------------------------------+
| apps/server: Hexagonal Backend                                          |
|                                                                         |
|  [Interfaces]      Express HTTP Routes, SSE Emitter, Zod, Auth, RateLim |
|        │                                                                |
|  [Application]     ChatTurnUseCase, Deterministic Router, System Prompts|
|        │                                                                |
|  [Domain]          Entities (Session, Message), Domain Errors           |
|        │                                                                |
|  [Infrastructure]  Postgres / PGlite, Tavily Client, OpenAI / Gemini   |
+-------------------------------------------------------------------------+
                                    │ Shared Types & Contract
                                    ▼
+-------------------------------------------------------------------------+
| packages/shared: EventType Contract, Constants, JSDoc Types             |
+-------------------------------------------------------------------------+
```

## The Dependency Rule

Dependencies point inward strictly: `Interfaces -> Application -> Domain`. Outer drivers (`Infrastructure`) implement domain ports. `scripts/check-boundaries.js` statically enforces that `domain` never references `infrastructure` or `interfaces`.

## How a Turn Flows

1. **Client Request**: Web SPA sends `POST /api/v1/chat` with message, session UUID, and `X-Client-Id`.
2. **Date Grounding**: `chrono-node` normalizes relative dates against reference time into ISO dates and appends a canonical `[date note: ...]` tag. The model never computes dates.
3. **User-Scoped Recall**: Scoped by `user_id`, queries retrieve turns matching target calendar dates and execute `websearch_to_tsquery('english', q)` full-text ranking over generated `tsvector` columns.
4. **Baseline Extraction**: Detects re-verification targets ("changed since", "is still correct") and passes the exact historical question + answer as an explicit `<baseline date="...">` block.
5. **Deterministic Router**: Rule engine selects `FAST_MODEL` or `DEEP_MODEL` in <1ms and mandates `tool_choice: "required"` when research signals are present.
6. **Parallel Tool Loop**: On tool calls, all queries execute concurrently via `Promise.all` with Tavily (8s timeout, canonical deduplication, `/pricing` and changelog ranking boosts).
7. **Streaming & Observability**: SSE emits typed events (`turn.started`, `search.started`, `token`, `sources`, `turn.completed`) that power the live StatusTimeline and Trace drawer.
8. **Persistence**: The completed turn, sources, query latencies, and metadata persist to PostgreSQL.

## Core Technical Decisions

- **Serverless PostgreSQL (Neon)**: Production PostgreSQL with pooled connections and SSL. Two clean repositories (`SessionRepository`, `MessageRepository`) execute parameterized queries and native `tsvector` with `websearch_to_tsquery`. For isolated unit tests, an in-memory `MemoryPort` fake provides rapid offline verification.
- **Plain SQL over ORMs**: Two clean repositories need only 6 parameterized queries and native `tsvector` full-text search. An ORM adds runtime bloat and hides query plans without benefit. Plain SQL migrations run automatically on boot.
- **React + Vite over Next.js**: Clear separation between a dedicated Express agent engine and a fast client SPA. Avoids server-component streaming quirks, edge-runtime limitations, and duplicate servers.

## What Was Rejected

- **Vector Database**: Semantic cosine similarity blurs temporal boundaries ("What did I ask on Tuesday?"). Calendar-partitioned SQL + `tsvector` provides exact recall with zero embedding latency.
- **Memory as an LLM Tool**: Disallowed by challenge constraints (exactly one tool: `web_search`) and wastes 1–2s on an extra LLM round-trip. Injected context is instant.
- **Multi-Agent / Planner-Critic Chains**: Multiply latency and token costs 3–5x. A lean single-loop agent with parallel execution is faster and more reliable.
- **LLM-Based Router**: Adds 300–800ms of pre-turn latency. Heuristic regex routing adds 0ms.

## Evaluation Results (Real Numbers)

From our automated test suite against real Neon PostgreSQL:
- **Test Suite Pass Rate**: 100.0% (20/20 cases passed in `eval:mock`)
- **Deterministic Harness over Neon**: TTFT p50 = 715ms, p95 = 874ms; Total latency p50 = 882ms, p95 = 1068ms
- **Live End-to-End Latencies (Gemini 2.5 Flash Lite + Tavily + Neon)**:
  - 5-entity CRM research (5 parallel searches): TTFT 12.4s, Total 14.9s
  - Historical recall & live re-verification (4 parallel searches): TTFT 7.8s, Total 9.5s
  - Time-bounded hosting price verification (3 parallel searches): TTFT 6.7s, Total 8.0s
  - Fresh user / no-history negative test (0 searches): TTFT 1.6s, Total 1.9s
  - Chit-chat / Stable facts (0 searches): TTFT 1.4s–1.6s, Total 1.7s–1.9s
- **Average Searches**: 0.9 per query across test suite (0 for greetings/math, 1–5 parallel for research)

## What I'd Do With Another Week

1. **AST Diffing**: Parse structured pricing tables to output line-by-line diffs between old and new states.
2. **Scheduled Proactive Re-Checks**: Background cron workers alerting on pricing adjustments for saved shortlists.
3. **Speculative Search Prefetching**: Trigger preliminary queries while streaming the opening conversational sentence.
