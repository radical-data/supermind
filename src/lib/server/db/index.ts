import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "$env/dynamic/private";
import { building } from "$app/environment";
import * as schema from "./schema";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let _db: ReturnType<typeof drizzle> | null = null;

function open() {
	// Use require to avoid loading native module at top-level import time
	const Database = require("better-sqlite3");
	const url = env.DATABASE_URL || "/data/app.db";
	const client = new Database(url);
	client.pragma("journal_mode = WAL");
	client.pragma("synchronous = NORMAL");
	return drizzle(client, { schema });
}

/** Call this in handlers at runtime. Never at module top-level. */
export function getDB() {
	// During build, return a proxy that throws on actual usage
	// This allows module-level const db = getDB() without crashing the build
	if (building) {
		return new Proxy({} as ReturnType<typeof drizzle>, {
			get() {
				throw new Error("Database not available during build");
			},
		});
	}
	if (_db) return _db;
	_db = open();
	return _db;
}
