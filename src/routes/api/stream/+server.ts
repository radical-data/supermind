import type { RequestHandler } from './$types';
import { addSubscriber, removeSubscriber } from '$lib/server/sse';
import { broadcastCounts } from '$lib/server/sse';
import { buildAndBroadcastGraph } from '$lib/server/graph';
import { db } from '$lib/server/db';
import { runs } from '$lib/server/db/schema';
import { getCurrentRunId } from '$lib/server';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	const stream = new ReadableStream<string>({
		start(controller) {
			addSubscriber(controller);
			// Kick a “snapshot” to the new client right away
			queueMicrotask(async () => {
				await broadcastCounts();
				await buildAndBroadcastGraph();
				// If we have a saved summary, send it too
				const runId = await getCurrentRunId();
				const [r] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
				if (r?.clustersJson) {
					// reuse SSE bus to deliver to this (and any other) subscribers
					const { send } = await import('$lib/server/sse');
					send('summary', JSON.parse(r.clustersJson));
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
