import { db } from '$lib/server/db';
import { submissions, participants } from '$lib/server/db/schema';
import { getCurrentRunId } from '.';
import { eq } from 'drizzle-orm';

const subscribers = new Set<ReadableStreamDefaultController<string>>();

export function addSubscriber(c: ReadableStreamDefaultController<string>) {
	subscribers.add(c);
}
export function removeSubscriber(c: ReadableStreamDefaultController<string>) {
	subscribers.delete(c);
}

export function send(event: string, data: any) {
	const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	for (const c of Array.from(subscribers)) {
		try {
			c.enqueue(msg);
		} catch {
			subscribers.delete(c); // remove closed controllers
		}
	}
}

export async function broadcastCounts() {
	const runId = await getCurrentRunId();
	const [subs] = await Promise.all([
		db.select().from(submissions).where(eq(submissions.runId, runId))
	]);
	send('submission_count', { count: subs.length });
}

export async function broadcastParticipants() {
	const people = await db.select().from(participants);
	send('participant_count', { count: people.length });
}
