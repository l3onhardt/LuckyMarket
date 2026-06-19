import cors from '@fastify/cors';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import type { Db } from '../db/connection.js';
import { AppError } from '../domain/errors.js';
import { registerRoutes } from './routes.js';

export interface BuildServerOptions {
  db: Db;
  schedulerEnabled: boolean;
  maxAgentsPerTick: number;
  feishuAppId?: string | null;
  feishuAppSecret?: string | null;
}

function hasFastifyValidation(error: unknown): error is { validation: unknown; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'validation' in error &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

export async function buildServer(options: BuildServerOptions) {
  const server = Fastify({ logger: false });

  await server.register(cors);
  await registerRoutes(server, options);

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.issues.map((issue) => issue.message).join('; ')
        }
      });
    }

    if (hasFastifyValidation(error)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message
        }
      });
    }

    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  return server;
}
