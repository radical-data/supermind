import { desc } from "drizzle-orm";
import { runs } from "./db/schema";
import { getDB } from "./db";

let currentRunId: number | null = null;

export async function getCurrentRunId() {
	if (currentRunId) return currentRunId;
	const db = getDB();

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
	const db = getDB();

	const inserted = await db.insert(runs).values({}).returning({ id: runs.id });
	currentRunId = inserted[0].id;
	return currentRunId;
}
