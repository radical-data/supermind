import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

let _db: ReturnType<typeof drizzle> | null = null;

function open() {
	// Prefer env, but provide a safe default so build-time imports never crash
	const url = env.DATABASE_URL || '/data/app.db';
	const client = new Database(url);
	client.pragma('journal_mode = WAL');
	client.pragma('synchronous = NORMAL');
	return drizzle(client, { schema });
}

/** Call this in handlers at runtime. Never at module top-level. */
export function getDB() {
	if (_db) return _db;
	_db = open();
	return _db;
}
