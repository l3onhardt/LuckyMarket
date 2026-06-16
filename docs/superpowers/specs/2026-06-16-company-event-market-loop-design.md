# Company Event Market Loop Design

## Scope

This design adds the first real company-event intelligence loop to LuckyMarket.
It should make markets feel affected by real company life without turning the
admin prompt or an LLM into a hidden odds controller.

The first closed loop is:

1. A market is created.
2. AI suggests which company events the market should listen to.
3. Admin confirms the binding.
4. Feishu Attendance sync creates world events on a nightly schedule.
5. Matching markets receive event-linked agent wake tasks.
6. Agents react through normal trades and signals.
7. Prices move through the market engine, not direct probability edits.
8. The market detail page explains which event caused which agent action.

The first real source is Feishu Attendance. The fallback source is manual admin
event entry.

## Current Backend Assessment

The existing backend already has the right base pieces:

- Markets, outcomes, AMM pricing, trades, positions, price snapshots, and
  activity records.
- Human and agent accounts using the same point ledger.
- Agent profiles, agent memories, wake runs, and agent actions.
- A scheduler that wakes due agents in bounded batches.
- A `company_facts` table placeholder.

The current backend does not yet have true model-backed AI behavior:

- No model provider SDK is installed.
- No model API key or model name is configured.
- Agent decisions are deterministic rules inside `AgentService.chooseOutcome`.
- Agent context does not include company facts or world events.
- `company_facts` is not exposed through an API and is not read by agents.
- Strong company events, such as "Wang Ge has already taken 6 rest days this
  month", cannot currently enter the market unless a human or agent manually
  trades.

The new loop should preserve the reliable rules-first market core and add
real event awareness around it.

## Product Principles

- A world event is evidence, not an odds command.
- AI may interpret and route events, but it must not directly set prices.
- Price movement must happen through trades, liquidity, and user behavior.
- Every automated action must be traceable to a source event, market binding,
  agent decision, and trade or signal.
- First version should prove one real company-data loop deeply rather than
  connect many shallow sources.
- Feishu Attendance is the first adapter, not the architecture.

## Non-Goals

First version will not include:

- Fully automatic market creation.
- Fully automatic binding without admin confirmation.
- AI directly changing market probability or outcome prices.
- Broad Feishu integration across chat, calendar, tasks, approvals, and docs.
- A company-wide knowledge graph.
- Complex multi-agent debate rooms.
- Autonomous settlement.
- Real-money or redeemable rewards.

## Architecture Overview

Add four backend concepts:

- `WorldEventService`: stores normalized company events from Feishu, manual
  admin input, and future adapters.
- `MarketBindingService`: stores confirmed rules that connect markets to event
  types and entity filters.
- `AgentEventQueue`: creates bounded, auditable wake tasks for relevant agents
  when an event matches a market.
- `FeishuAttendanceAdapter`: syncs Feishu Attendance data and emits normalized
  world events.

Existing services remain the source of truth for market effects:

- `MarketService` still owns quotes, trades, prices, snapshots, and activity.
- `AgentService` still owns agent context, decisions, wake runs, and actions.
- `SchedulerService` expands from only "due agents" to "due agents plus queued
  event reactions".

## World Events

A world event is a normalized fact-like record:

- `id`
- `type`
- `source`
- `source_ref`
- `subject_type`
- `subject_id`
- `subject_label`
- `period`
- `effective_at`
- `observed_at`
- `confidence`
- `summary`
- `payload_json`
- `dedupe_key`
- `created_at`

Example:

```json
{
  "type": "attendance.monthly_summary_updated",
  "source": "feishu_attendance",
  "subject_type": "person",
  "subject_id": "wang-ge",
  "subject_label": "王哥",
  "period": "2026-06",
  "confidence": "high",
  "summary": "王哥 2026-06 已休息 6 天。",
  "payload": {
    "restDaysSoFar": 6,
    "workDaysSoFar": 8,
    "month": "2026-06"
  }
}
```

Events should be append-only for auditability. If Feishu later reports corrected
data, the adapter writes a newer event with the same subject and period, not an
in-place rewrite of the old event. The dedupe key prevents repeated nightly
syncs from creating duplicate events when values have not changed.

## Feishu Attendance Sync

The Feishu adapter runs on a schedule:

- Primary nightly sync: around 20:30 Asia/Shanghai.
- Follow-up nightly sync: around 21:15 Asia/Shanghai, to catch late attendance
  updates.
- Manual admin sync endpoint for demos and recovery.

The adapter should only sync people or departments currently referenced by
confirmed market bindings. It should not scan the whole company by default.

The first adapter output is monthly attendance summary events:

- `attendance.monthly_summary_updated`
- subject: person
- period: month
- metrics: rest days so far, work days so far, absence or leave counts if
  available from the configured Feishu permissions

Implementation must verify the exact Feishu endpoints and permission scopes
against current official Feishu documentation before coding. The design should
not depend on a single endpoint name; the adapter interface should isolate
Feishu-specific API details.

## Manual Event Entry

Manual admin event entry is the fallback source for markets whose company system
adapter does not exist yet.

Admin can create a world event with:

- event type
- subject
- period
- short summary
- structured payload
- confidence

Manual events use `source = manual_admin`. They follow the same matching,
queueing, agent decision, and activity rules as Feishu events. This makes manual
input a first-class source without giving it direct control over odds.

## Semi-Automatic Market Binding

When an admin creates or edits a market, the system suggests event bindings.

Input to the suggestion step:

- market title
- category
- outcomes
- close time
- settlement source
- optional admin notes

Output:

- candidate event type
- subject type and subject id or label
- period
- relevant metrics
- confidence
- natural-language explanation

Example:

```json
{
  "eventType": "attendance.monthly_summary_updated",
  "subjectType": "person",
  "subjectLabel": "王哥",
  "period": "2026-06",
  "metrics": ["restDaysSoFar"],
  "confidence": "medium",
  "explanation": "The market asks how many days Wang Ge will rest in June, so monthly attendance summaries for Wang Ge are relevant."
}
```

The admin must confirm or edit the candidate before it becomes active.

If no model provider is configured, the backend should still support manual
binding creation. The AI suggestion feature is allowed to be unavailable while
the event loop itself remains usable.

## Market Binding Data

A market binding connects a market to event filters:

- `id`
- `market_id`
- `event_type`
- `subject_type`
- `subject_id`
- `subject_label`
- `period`
- `metric_keys_json`
- `status`
- `suggested_by`
- `confirmed_by`
- `created_at`
- `updated_at`

Matching rules are intentionally simple in V1:

- event type must match exactly
- subject type must match exactly
- subject id should match when available
- period should match when the binding has a period
- metric keys are advisory for agent context, not matching requirements

This keeps the system easy to reason about and avoids accidental cross-market
effects.

## Event To Agent Queue

When a world event is created:

1. Find active market bindings that match the event.
2. Add market activity: "Company event received".
3. Enqueue relevant agent wakes for that market.
4. Record why each wake was queued.

Relevant agents in V1:

- HR Data Agent for attendance events.
- Market Maker Agent for liquidity response.
- Trend Agent only after price movement or on its normal tick.
- Other agents only if their focus categories match the market category.

The queue should have caps:

- maximum queued agent wakes per event
- per-agent cooldown for the same market and event type
- no duplicate wake task for the same event, market, and agent

This creates a visible event response without making every event trigger the
entire agent population.

## Agent Event Context

Agent wake context should include:

- matched world events for the market
- current market prices
- recent price movement
- recent human trades
- agent memory summary
- existing position and balance
- risk limits
- event confidence and source

For the "Wang Ge has rested 6 days" example, HR Data Agent should see:

- market: `王哥将在6月休息几天？`
- outcomes: `0-1天`, `2-3天`, `4-5天`, `6天以上`
- event: `restDaysSoFar = 6`
- current price for `6天以上`
- its current position and remaining budget

The agent may then buy `6天以上` if the current price is below its fair value.
It still goes through the existing quote and trade path.

## Agent Decision Rules For V1

Keep decisioning rules-first for reliability.

Attendance data-value rule:

- If a market has ordered numeric bucket outcomes and the event metric already
  satisfies or exceeds a bucket, assign high fair value to that bucket.
- If the metric is close to a higher bucket, assign rising fair value to the
  higher bucket.
- Confidence scales with source confidence and time remaining.

For `王哥 2026-06 已休息 6 天`:

- `6天以上` is already satisfied.
- HR Data Agent should strongly prefer `6天以上`.
- It should still size trades by max trade points, balance, max position shares,
  and edge threshold.

Market Maker rule:

- Do not infer truth directly.
- Provide small liquidity around event-informed fair price bands.
- Avoid over-trading the same market after repeated identical events.

Trend rule:

- React mainly to price movement, not directly to raw attendance facts.
- This gives the market a second wave instead of everyone moving at once.

## LLM Provider Role

LLM use is helpful but optional in V1.

LLM can be used for:

- suggesting market bindings from natural-language market descriptions
- turning structured events into concise explanations
- compressing agent memory summaries
- drafting agent signal text

LLM must not be required for:

- Feishu sync
- event matching
- queueing
- agent risk controls
- executing trades
- settlement

Configuration should be explicit:

- provider
- API key
- model
- daily token or cost budget
- feature flags for binding suggestions and text generation

If no provider is configured, the app should degrade to manual binding and
template explanations.

## Scheduler Behavior

The scheduler should support multiple tick types:

- `normal_agent_tick`: current due-agent behavior.
- `feishu_attendance_sync_tick`: nightly attendance sync.
- `event_queue_tick`: process queued event reactions.
- `market_maker_tick`: lightweight liquidity upkeep.
- `closing_tick`: increased attention near close time.

The event queue tick should run soon after a new event, but agents should still
look like participants. Suggested first-version timing:

- HR Data Agent: within 1-2 minutes of attendance event creation.
- Market Maker Agent: within 2-4 minutes.
- Trend Agent: normal tick or after price movement.

This is fast enough for demos but avoids instant omniscient price jumps.

## Activity And Explainability

The market detail page should be able to show a causal chain:

- Feishu Attendance event received.
- Binding matched this market.
- HR Data Agent woke because of the event.
- Agent bought `6天以上`.
- Price moved from the trade's `priceBefore` to `priceAfter`, backed by normal
  market snapshots.

Activities should be stored as structured records, not only display strings.
Important activity types:

- `world_event_received`
- `market_binding_matched`
- `agent_event_wake_queued`
- `agent_signal`
- `agent_trade`
- `market_price_moved`

The product should make it obvious that the market changed because agents and
humans traded, not because the backend directly rewrote odds.

## API Surface

New endpoints:

- `POST /world-events`
- `GET /world-events`
- `GET /markets/:id/world-events`
- `POST /markets/:id/bindings/suggest`
- `POST /markets/:id/bindings`
- `GET /markets/:id/bindings`
- `PATCH /markets/:id/bindings/:bindingId`
- `POST /integrations/feishu/attendance/sync`
- `GET /agent-event-queue`
- `POST /scheduler/event-queue/tick`

The exact Feishu credential setup endpoints can wait until implementation
planning, but credentials must not be hard-coded. They should come from
environment variables or a secure local config path ignored by git.

## Data Model

Add tables:

- `world_events`
- `market_event_bindings`
- `agent_event_queue`
- `integration_sync_runs`

Reuse tables:

- `activities`
- `agent_wake_runs`
- `agent_actions`
- `market_price_snapshots`

The existing `company_facts` table can either be migrated into `world_events` or
kept as a legacy alias if migrations need to be conservative. New code should
prefer `world_events`.

## Privacy And Safety

Attendance data is sensitive internal company data. V1 should minimize exposure:

- Sync only subjects referenced by confirmed market bindings.
- Store only metrics needed by the market, not raw full attendance logs.
- Mark source and confidence, but avoid exposing unnecessary personal details.
- Keep Feishu app credentials out of git.
- Limit admin-only endpoints for manual event creation, sync, and binding
  confirmation.
- Avoid using sensitive raw records in LLM prompts unless explicitly enabled.

If LLM binding suggestions are enabled, prompt payloads should include market
metadata and known subject labels, not raw attendance rows.

## Failure Handling

Feishu sync failure:

- Record an `integration_sync_runs` failure.
- Do not create partial misleading events.
- Surface sync status to admin.
- Keep existing markets and agents running on prior data.

Duplicate event:

- Deduplicate by source, subject, period, event type, and key metric values.
- Do not enqueue duplicate agent reactions.

Binding ambiguity:

- Return multiple suggestions with confidence.
- Require admin confirmation.
- If confidence is low, recommend manual binding.

Agent trade failure:

- Record the wake run and signal reason.
- Do not retry endlessly.
- Preserve the event and queue record for audit.

Missing LLM config:

- Binding suggestion endpoint returns a clear disabled status.
- Manual binding remains available.

## Testing Strategy

Tests should cover the complete loop:

- Manual world event creation stores an append-only event.
- Feishu adapter test double emits an attendance monthly summary event.
- Duplicate Feishu sync does not duplicate events.
- Market binding suggestion can be disabled when no LLM config exists.
- Confirmed binding matches the right attendance event.
- Unrelated event does not match the market.
- Matched event enqueues HR Data Agent and Market Maker Agent with caps.
- Event queue tick wakes bounded agents.
- HR Data Agent sees `restDaysSoFar = 6` and buys the `6天以上` outcome.
- Agent trade changes AMM price through existing market services.
- Market activity exposes the causal chain.
- Sync failure records an integration error without changing markets.

## Rollout Plan

Phase 1 should ship the closed loop for one real use case:

- `王哥将在6月休息几天？`
- Feishu Attendance monthly summary sync.
- Semi-automatic binding with admin confirmation.
- HR Data Agent event reaction.
- Market Maker Agent light response.
- Market activity explanation.

Phase 2 can add:

- More attendance markets.
- Better bucket parsing for numeric outcomes.
- LLM-generated agent signal copy.
- More Feishu attendance metrics.

Phase 3 can add:

- Feishu approval, calendar, chat, or docs adapters.
- More advanced market binding suggestions.
- Daily market briefings.
- Agent memory compression.

The first phase is complete when a real Feishu attendance update can enter the
system, match a confirmed market binding, trigger agent actions, move prices
through normal trades, and show the full explanation chain on the market.

The first phase should not add a second external adapter. If another market
needs company context before its adapter exists, it should use manual world
events through the same event and binding path.
