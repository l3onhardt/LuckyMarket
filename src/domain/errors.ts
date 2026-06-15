export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INSUFFICIENT_BALANCE'
  | 'MARKET_CLOSED'
  | 'MARKET_NOT_SETTLED'
  | 'MARKET_ALREADY_SETTLED'
  | 'INVALID_OUTCOME'
  | 'AGENT_BUDGET_EXCEEDED'
  | 'EXPOSURE_LIMIT_EXCEEDED';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFound(message: string): AppError {
  return new AppError('NOT_FOUND', message, 404);
}
