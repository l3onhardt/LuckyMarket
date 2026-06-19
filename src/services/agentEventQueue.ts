import type { Db } from '../db/connection.js';
import { inTransaction } from '../db/connection.js';
import type {
  AgentEventQueueItem,
  AgentEventQueueStatus,
  MarketEventBinding,
  WorldEvent
} from '../domain/types.js';
import type { AgentProfile, AgentService } from './agents.js';
import { newId } from './ids.js';
import type { MarketBindingService } from './marketBindings.js';

export interface AgentEventQueueTickResult {
  processedQueueItems: string[];
  failedQueueItems: string[];
  remainingQueuedItems: number;
}

interface AgentEventQueueRow {
  id: string;
  world_event_id: string;
  market_id: string;
  binding_id: string;
  account_id: string;
  reason: string;
  status: AgentEventQueueStatus;
  created_at: string;
  processed_at: string | null;
  failure_reason: string | null;
  wake_run_id: string | null;
}

interface QueueTarget {
  agent: AgentProfile;
  reason: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapQueueItem(row: AgentEventQueueRow): AgentEventQueueItem {
  return {
    id: row.id,
    worldEventId: row.world_event_id,
    marketId: row.market_id,
    bindingId: row.binding_id,
    accountId: row.account_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    failureReason: row.failure_reason,
    wakeRunId: row.wake_run_id
  };
}

export class AgentEventQueueService {
  constructor(
    private readonly db: Db,
    private readonly agents: AgentService,
    private readonly bindings: MarketBindingService
  ) {}

  enqueueForEvent(event: WorldEvent): AgentEventQueueItem[] {
    return inTransaction(this.db, () => {
      const matchingBindings = this.bindings.findMatchingBindings(event);
      const created: AgentEventQueueItem[] = [];

      for (const binding of matchingBindings) {
        for (const target of this.pickAgentsForBinding(binding)) {
          const inserted = this.insertQueueItem(event, binding, target.agent.accountId, target.reason);
          if (inserted) {
            created.push(inserted);
          }
        }
      }

      return created;
    });
  }

  listQueued(limit = 50): AgentEventQueueItem[] {
    const cappedLimit = Math.max(1, Math.min(Math.floor(limit), 100));
    const rows = this.db
      .prepare(
        `SELECT * FROM agent_event_queue
         WHERE status = 'queued'
         ORDER BY created_at ASC, id ASC
         LIMIT ?`
      )
      .all(cappedLimit) as AgentEventQueueRow[];

    return rows.map(mapQueueItem);
  }

  tick(limit = 3): AgentEventQueueTickResult {
    const queued = this.listQueued(limit);
    const processedQueueItems: string[] = [];
    const failedQueueItems: string[] = [];

    for (const item of queued) {
      try {
        const wake = this.agents.wakeAgent(item.accountId, {
          worldEventId: item.worldEventId,
          marketId: item.marketId,
          bindingId: item.bindingId,
          queueItemId: item.id,
          reason: item.reason
        });
        this.markProcessed(item.id, wake.wakeRunId);
        processedQueueItems.push(item.id);
      } catch (error) {
        this.markFailed(item.id, error instanceof Error ? error.message : 'Unknown queue processing error');
        failedQueueItems.push(item.id);
      }
    }

    return {
      processedQueueItems,
      failedQueueItems,
      remainingQueuedItems: this.countQueued()
    };
  }

  private pickAgentsForBinding(binding: MarketEventBinding): QueueTarget[] {
    const agents = this.agents
      .listAgents()
      .filter((agent) => agent.focusCategories.includes('attendance'));

    const selected: QueueTarget[] = [];

    for (const agent of agents) {
      if (agent.strategy === 'data_value') {
        selected.push({ agent, reason: 'attendance_data_reaction' });
      } else if (agent.strategy === 'market_maker') {
        selected.push({ agent, reason: 'liquidity_response' });
      }
    }

    const reasonPriority = new Map<string, number>([
      ['attendance_data_reaction', 0],
      ['liquidity_response', 1]
    ]);

    return selected.sort((left, right) => {
        const leftPriority = reasonPriority.get(left.reason) ?? Number.MAX_SAFE_INTEGER;
        const rightPriority = reasonPriority.get(right.reason) ?? Number.MAX_SAFE_INTEGER;
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        return left.agent.accountId.localeCompare(right.agent.accountId);
      });
  }

  private insertQueueItem(
    event: WorldEvent,
    binding: MarketEventBinding,
    accountId: string,
    reason: string
  ): AgentEventQueueItem | null {
    const createdAt = nowIso();
    const id = newId('aeq');

    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO agent_event_queue (
          id, world_event_id, market_id, binding_id, account_id, reason,
          status, created_at, processed_at, failure_reason, wake_run_id
        ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, NULL, NULL, NULL)`
      )
      .run(id, event.id, binding.marketId, binding.id, accountId, reason, createdAt);

    if (result.changes === 0) {
      return null;
    }

    return {
      id,
      worldEventId: event.id,
      marketId: binding.marketId,
      bindingId: binding.id,
      accountId,
      reason,
      status: 'queued',
      createdAt,
      processedAt: null,
      failureReason: null,
      wakeRunId: null
    };
  }

  private markProcessed(queueItemId: string, wakeRunId: string): void {
    this.db
      .prepare(
        `UPDATE agent_event_queue
         SET status = 'processed',
             processed_at = ?,
             wake_run_id = ?
         WHERE id = ?`
      )
      .run(nowIso(), wakeRunId, queueItemId);
  }

  private markFailed(queueItemId: string, failureReason: string): void {
    this.db
      .prepare(
        `UPDATE agent_event_queue
         SET status = 'failed',
             processed_at = ?,
             failure_reason = ?
         WHERE id = ?`
      )
      .run(nowIso(), failureReason, queueItemId);
  }

  private countQueued(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM agent_event_queue WHERE status = 'queued'")
      .get() as { count: number };

    return row.count;
  }
}
