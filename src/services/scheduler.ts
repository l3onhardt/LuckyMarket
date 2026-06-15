import type { AgentService } from './agents.js';

export interface SchedulerConfig {
  maxAgentsPerTick: number;
}

export interface SchedulerTickResult {
  now: string;
  wokenAgents: string[];
  skippedDueAgents: number;
}

const DUE_AGENT_BACKLOG_LIMIT = 10_000;

export class SchedulerService {
  constructor(
    private readonly agents: AgentService,
    private readonly config: SchedulerConfig
  ) {}

  tick(nowIso = new Date().toISOString()): SchedulerTickResult {
    const configuredMaxAgents = Math.floor(this.config.maxAgentsPerTick);
    const maxAgentsPerTick = Number.isFinite(configuredMaxAgents) ? Math.max(0, configuredMaxAgents) : 0;
    const dueAgents = this.agents.getDueAgents(nowIso, DUE_AGENT_BACKLOG_LIMIT);
    const agentsToWake = dueAgents.slice(0, maxAgentsPerTick);
    const wokenAgents = agentsToWake.map((agent) => {
      this.agents.wakeAgent(agent.accountId);
      return agent.accountId;
    });

    return {
      now: nowIso,
      wokenAgents,
      skippedDueAgents: dueAgents.length - agentsToWake.length
    };
  }
}
