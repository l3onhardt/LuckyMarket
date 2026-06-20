import type { WorldEvent } from '@/types';
import { formatProbability } from './utils';

export interface EventDrivenActivityPayload {
  worldEventSummary?: string;
  outcomeLabel?: string;
  priceBefore?: number;
  priceAfter?: number;
}

export function describeWorldEvent(event: WorldEvent): string {
  return event.summary;
}

export function describeWorldEventActivity(payload: EventDrivenActivityPayload | Record<string, unknown>): string {
  const event = typeof payload.worldEventSummary === 'string' ? payload.worldEventSummary : '公司事件';
  const outcome = typeof payload.outcomeLabel === 'string' ? `，买入 ${payload.outcomeLabel}` : '';
  const price =
    typeof payload.priceBefore === 'number' && typeof payload.priceAfter === 'number'
      ? `，价格 ${formatProbability(payload.priceBefore)} -> ${formatProbability(payload.priceAfter)}`
      : '';

  return `${event}${outcome}${price}`;
}
