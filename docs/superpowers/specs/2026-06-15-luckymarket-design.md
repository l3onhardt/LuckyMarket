# LuckyMarket Design

## Scope

LuckyMarket V1 backend phase is the first implementation layer for a company-internal prediction market. It must support real point-based trading, multiple human users, AI agent participants, settlement, and a low-cost scheduler that keeps markets active without high model spend. Frontend implementation is explicitly out of scope for this phase.

## Research Basis

This design borrows only public, verifiable patterns:

- OpenAI Agents SDK documents agents as model configurations with instructions, tools, handoffs, context, and tracing. LuckyMarket uses that as inspiration for bounded tools, context packets, and action traces.
- OpenAI Codex subagent documentation emphasizes bounded tasks, explicit orchestration, parallel or background execution, and returning summaries instead of raw intermediate work. LuckyMarket uses that as inspiration for task-like market agent wakes.
- Inflection's public Pi positioning is human-centered and personal AI. LuckyMarket treats that as product inspiration for continuity and personality, not as an engineering architecture.

## Product Contract

- Points are platform-only game points. They cannot be redeemed for money, gifts, or real-world value.
- Human users and AI agents share the same trading system, ledger, market prices, positions, and rankings.
- AI participants are always marked as agents in API data.
- The backend exposes enough API surface for a Polymarket-like frontend, but does not ship frontend code.
- V1 must be reliable and understandable before it is clever.

## Architecture

Use a TypeScript modular monolith:

- Fastify HTTP API.
- SQLite persistence.
- Internal scheduler running in the same process.
- Service modules for markets, ledger, accounts, agents, settlement, and activity feeds.

This keeps deployment simple while preserving clean module boundaries. If the product grows, the scheduler and agent runner can later move to a worker process without changing the public API.

## Market Engine

Markets are multi-outcome prediction markets:

- Each market has title, category, close time, settlement source, status, and outcomes.
- Outcome prices are shown as `0-100` probability-like point prices.
- A winning share settles to `100` points; a losing share settles to `0`.
- V1 uses an AMM so markets are always tradable even when few humans are online.
- The schema still records trades, positions, price snapshots, and activity so a future order book can be added without rewriting frontend concepts.

The AMM should be LMSR-style or an equivalent bounded-cost scoring-rule market maker. The implementation must keep prices inside a sane range, quote before execution, and update positions and ledgers in a single transaction.

## Points And Ledger

Every account has a balance derived from an append-only ledger.

Ledger event types:

- Initial grant.
- Admin grant.
- Trade debit.
- Trade credit.
- Settlement payout.
- Market creation deposit.
- Agent budget grant.
- Fee burn, if enabled later.

V1 should keep point mechanics minimal:

- Users and agents start with seeded points.
- Trades consume points.
- Settlements pay winning positions.
- Balances may never go negative.
- No marketplace, redemption, or complex rewards in V1.

## Accounts

Accounts represent both humans and agents:

- `kind`: `human`, `agent`, or `system`.
- Display name and handle.
- Status: active or disabled.
- Created time and last active time.

Human identity can be simple for V1. Authentication can be added later; the backend should keep account IDs explicit so the frontend can develop against stable APIs.

## AI Agent Model

Agents are task-like market participants, not always-on chat personalities.

Each agent has:

- Account ID and point balance.
- Role profile, such as HR Data, Boss View, Engineer Reality, Trend Trader, Contrarian, or Market Maker.
- Strategy settings: risk appetite, focus categories, max trade size, max exposure, wake interval, and daily action budget.
- Memory summary: compact company context and past performance notes.
- Current positions and realized/unrealized performance.

An agent wake receives a context packet:

- Market title, rules, outcomes, close time, and category.
- Current outcome prices.
- Recent trades and price changes.
- Agent balance, open positions, and risk limits.
- Relevant company fact summaries.
- Agent memory summary.
- Allowed actions and budget for this wake.

Allowed actions:

- Skip.
- Quote a trade.
- Place a trade.
- Write a short signal.
- Update memory summary.

Agents never modify balances or markets directly. All actions go through the same services humans use.

## Agent Decision Engine

V1 should be rules-first:

- Estimate fair probability from agent strategy, market category, recent price movement, and company facts.
- Compare fair probability to current price.
- Trade only if edge exceeds a threshold.
- Size trades by confidence, risk appetite, balance, and exposure limits.
- Market Maker Agent maintains light liquidity around a fair price with small spreads.
- Generate short rationale from templates unless an LLM hook is explicitly enabled later.

This creates depth without depending on high token spend. LLM use can later be limited to short signal writing or memory compression.

## Scheduler

The scheduler runs low-concurrency ticks:

- Normal tick: every few minutes, check due agents and wake only a small batch.
- Event tick: after new market creation, large human trade, or sharp price movement, enqueue a few relevant agents.
- Closing tick: near market close, slightly increase activity.
- Daily tick: write market snapshots and agent memory summaries.

Budget controls:

- Max agents per tick.
- Max trades per tick.
- Max signals per tick.
- Daily action budget per agent.
- Daily optional model-token budget per agent, defaulting to zero in V1.
- Cooldown after losses or repeated activity.

## Data Model

Core tables:

- `accounts`
- `ledger_entries`
- `markets`
- `market_outcomes`
- `trades`
- `positions`
- `market_price_snapshots`
- `activities`
- `agent_profiles`
- `agent_memories`
- `agent_wake_runs`
- `agent_actions`
- `company_facts`

All trading, settlement, and ledger writes must use database transactions.

## API Surface

Core endpoints:

- `GET /health`
- `POST /accounts`
- `GET /accounts/:id`
- `GET /accounts/:id/ledger`
- `GET /accounts/:id/positions`
- `GET /markets`
- `POST /markets`
- `GET /markets/:id`
- `POST /markets/:id/quote`
- `POST /markets/:id/trades`
- `POST /markets/:id/close`
- `POST /markets/:id/settle`
- `GET /markets/:id/activity`
- `GET /markets/:id/prices`
- `GET /agents`
- `GET /agents/:id`
- `POST /agents/:id/wake`
- `POST /scheduler/tick`
- `POST /seed/demo`

The frontend should be able to render market lists, market detail pages, user balances, positions, price charts, activity feeds, agent signals, and Human vs AI comparisons from these endpoints.

## Error Handling

The backend must reject:

- Trades on closed or settled markets.
- Trades with invalid outcome IDs.
- Trades that would exceed balance.
- Trades that would exceed agent exposure limits.
- Duplicate settlement.
- Settlement to an outcome outside the market.
- Agent actions outside their allowed tool set.

Errors should use stable machine-readable codes, such as `INSUFFICIENT_BALANCE`, `MARKET_CLOSED`, and `AGENT_BUDGET_EXCEEDED`.

## Seed Data

Demo seed should include:

- Human accounts: admin, wang-ge, xiao-li, xiao-zhao.
- Agent accounts: HR Data Agent, Boss View Agent, Engineer Reality Agent, Trend Agent, Contrarian Agent, Market Maker Agent.
- Primary market: `王哥将在6月休息几天？`
- Outcomes: `0-1天`, `2-3天`, `4-5天`, `6天以上`.
- A few company-style markets for frontend testing.
- Initial point grants for all humans and agents.

## Testing Strategy

Write behavior tests for:

- AMM quote and price movement.
- Buying and selling shares.
- Ledger balance derivation.
- Preventing negative balances.
- Position updates.
- Settlement payouts.
- Closed-market restrictions.
- Agent due selection.
- Agent budget limits.
- Rule-based agent trade decisions.
- Scheduler tick limits.
- API route behavior.

The implementation should be test-first for the core money and market logic.

## Implementation Notes

- Keep core market math independent of HTTP.
- Keep ledger writes append-only.
- Keep scheduler deterministic enough to test.
- Store all timestamps as ISO strings.
- Prefer explicit IDs generated by the backend.
- Do not add real-money language, wallets, payment integrations, or redemption flows.
- Do not build frontend assets in this phase.

## References

- OpenAI Agents SDK guide: `https://developers.openai.com/api/docs/guides/agents`
- OpenAI Agents SDK agent concepts: `https://openai.github.io/openai-agents-python/agents/`
- OpenAI Agents SDK handoffs: `https://openai.github.io/openai-agents-python/handoffs/`
- OpenAI Codex subagents: `https://developers.openai.com/codex/subagents`
- Inflection Pi public product page: `https://hey.pi.ai/`

## Approval Status

This spec reflects the approved first implementation phase: modular monolith, AMM now with order-book-compatible records, platform-only points, humans and AI agents in one market, and Codex-like task agent wakes with Pi-like continuity only as product flavor.
