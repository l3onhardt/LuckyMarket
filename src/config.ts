export interface AppConfig {
  port: number;
  databaseUrl: string;
  schedulerEnabled: boolean;
  maxAgentsPerTick: number;
  feishuAppId: string | null;
  feishuAppSecret: string | null;
}

export function loadConfig(env = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 4000),
    databaseUrl: env.DATABASE_URL ?? 'data/luckymarket.sqlite',
    schedulerEnabled: env.SCHEDULER_ENABLED !== 'false',
    maxAgentsPerTick: Number(env.MAX_AGENTS_PER_TICK ?? 3),
    feishuAppId: env.FEISHU_APP_ID ?? null,
    feishuAppSecret: env.FEISHU_APP_SECRET ?? null
  };
}
