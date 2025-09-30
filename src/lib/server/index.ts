import { getDB } from './db';
const db = getDB();
import { runs } from './db/schema';
import { desc } from 'drizzle-orm';

let currentRunId: number | null = null;

export async function getCurrentRunId() {
	if (currentRunId) return currentRunId;
	const [latest] = await db.select().from(runs).orderBy(desc(runs.id)).limit(1);
	if (latest) {
		currentRunId = latest.id;
		return currentRunId;
	}
	const inserted = await db.insert(runs).values({}).returning({ id: runs.id });
	currentRunId = inserted[0].id;
	return currentRunId;
}

export async function resetRun() {
	// Start a brand-new run row and swap currentRunId
	const inserted = await db.insert(runs).values({}).returning({ id: runs.id });
	currentRunId = inserted[0].id;
	return currentRunId;
}
