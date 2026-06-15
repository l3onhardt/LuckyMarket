import Database from 'better-sqlite3';
import type { Db } from '../src/db/connection.js';
import { createSchema } from '../src/db/schema.js';

export function createTestDb(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  return db;
}

export async function seedDemoDataForTest(db: Db) {
  const { seedDemoData } = await import('../src/db/seed.js');
  return seedDemoData(db);
}
