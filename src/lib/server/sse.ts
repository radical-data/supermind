import { db } from './db';
import { submissions, votes as votesTable } from './db/schema';
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
	const [subs, vts] = await Promise.all([
		db.select().from(submissions).where(eq(submissions.runId, runId)),
		db.select().from(votesTable).where(eq(votesTable.runId, runId))
	]);
	send('submission_count', { count: subs.length });
	const all = vts.map((v) => v.value);
	const A = vts.filter((v) => v.tableSide === 'A').map((v) => v.value);
	const B = vts.filter((v) => v.tableSide === 'B').map((v) => v.value);
	const median = (xs: number[]) =>
		xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : null;
	send('vote_medians', { overall: median(all), A: median(A), B: median(B), count: vts.length });
}
