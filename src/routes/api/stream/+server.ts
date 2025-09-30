import type { RequestHandler } from './$types';
import { addSubscriber, broadcastParticipants, removeSubscriber, send } from '$lib/server/sse';
import { broadcastCounts } from '$lib/server/sse';
import { buildAndBroadcastGraph } from '$lib/server/graph';
import { getDB } from '$lib/server/db';
const db = getDB();
import { runs, submissions } from '$lib/server/db/schema';
import { getCurrentRunId } from '$lib/server';
import { eq } from 'drizzle-orm';

/** Small helper: get display text from a submission payload */
function extractText(payload: any): string {
	// Prefer single-line payload
	if (typeof payload?.text === 'string') return payload.text.trim();
	// Back-compat for old triad shape
	return [payload?.fact, payload?.constraint, payload?.hope].filter(Boolean).join(' ').trim();
}

export const GET: RequestHandler = async () => {
	const stream = new ReadableStream<string>({
		start(controller) {
			addSubscriber(controller);

			// Kick a “snapshot” to the new client right away
			queueMicrotask(async () => {
				// Always push current counters & graph to all subscribers
				await broadcastCounts();
				await broadcastParticipants();
				await buildAndBroadcastGraph();

				// If we have a saved summary, broadcast it (so everyone stays in sync)
				const runId = await getCurrentRunId();
				const [r] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
				if (r?.clustersJson) {
					try {
						send('summary', JSON.parse(r.clustersJson));
					} catch {
						/* ignore malformed saved JSON */
					}
				}
				if (r?.pairsJson) {
					const { send } = await import('$lib/server/sse');
					send('matches', JSON.parse(r.pairsJson));
				}

				// Send this *new client* a lightweight snapshot of recent lines for bubbles
				try {
					const rows = await db.select().from(submissions).where(eq(submissions.runId, runId));
					const recent = rows.slice(-10).map((row) => {
						const payload = JSON.parse(row.payloadJson ?? '{}');
						return {
							submissionId: row.id,
							participantId: row.participantId,
							text: extractText(payload)
						};
					});
					// Only enqueue to this controller so we don't spam all clients
					controller.enqueue(`event: recent_lines\ndata: ${JSON.stringify(recent)}\n\n`);
				} catch {
					// If snapshot fails, just skip it; the stream remains alive
				}
			});
		},
		cancel(controller) {
			removeSubscriber(controller);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
