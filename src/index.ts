import { loadConfig } from './config.js';
import { seedDemoData } from './db/seed.js';
import type { Db } from './db/connection.js';
import { openDatabase } from './db/connection.js';
import { buildServer } from './http/server.js';
import { AgentEventQueueService } from './services/agentEventQueue.js';
import { AgentService } from './services/agents.js';
import { LedgerService } from './services/ledger.js';
import { MarketBindingService } from './services/marketBindings.js';
import { MarketService } from './services/markets.js';
import { SchedulerService } from './services/scheduler.js';

const SCHEDULER_INTERVAL_MS = 60_000;
const EVENT_QUEUE_INTERVAL_MS = 30_000;

function startBackgroundScheduler(db: Db, maxAgentsPerTick: number): NodeJS.Timeout {
  const ledger = new LedgerService(db);
  const markets = new MarketService(db, ledger);
  const agents = new AgentService(db, ledger, markets);
  const scheduler = new SchedulerService(agents, { maxAgentsPerTick });

  const runTick = (): void => {
    try {
      scheduler.tick();
    } catch (error) {
      console.error('Background scheduler tick failed', error);
    }
  };

  return setInterval(runTick, SCHEDULER_INTERVAL_MS);
}

function startEventQueueScheduler(db: Db, maxAgentsPerTick: number): NodeJS.Timeout {
  const ledger = new LedgerService(db);
  const markets = new MarketService(db, ledger);
  const agents = new AgentService(db, ledger, markets);
  const bindings = new MarketBindingService(db, markets);
  const queue = new AgentEventQueueService(db, agents, bindings);

  const runTick = (): void => {
    try {
      queue.tick(maxAgentsPerTick);
    } catch (error) {
      console.error('Event queue tick failed', error);
    }
  };

  return setInterval(runTick, EVENT_QUEUE_INTERVAL_MS);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.databaseUrl);
  seedDemoData(db);
  const schedulerInterval = config.schedulerEnabled
    ? startBackgroundScheduler(db, config.maxAgentsPerTick)
    : undefined;
  const eventQueueInterval = config.schedulerEnabled
    ? startEventQueueScheduler(db, config.maxAgentsPerTick)
    : undefined;
  const server = await buildServer({
    db,
    schedulerEnabled: config.schedulerEnabled,
    maxAgentsPerTick: config.maxAgentsPerTick,
    feishuAppId: config.feishuAppId,
    feishuAppSecret: config.feishuAppSecret
  });

  const address = await server.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`luckymarket listening at ${address}`);

  const shutdown = async (): Promise<void> => {
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
    }
    if (eventQueueInterval) {
      clearInterval(eventQueueInterval);
    }
    await server.close();
    db.close();
  };

  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
