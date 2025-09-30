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

			// 🔸 immediate anti-buffer padding + recommended retry
			controller.enqueue(`retry: 10000\n`); // let client backoff if dropped
			controller.enqueue(`: open\n\n`); // comment line (flush hint)
			// Optional larger pad to beat aggressive buffering:
			// controller.enqueue(':' + ' '.repeat(2048) + '\n\n');

			// 🔸 heartbeat to keep proxies happy
			const hb = setInterval(() => {
				try {
					controller.enqueue(`: ping ${Date.now()}\n\n`);
				} catch {}
			}, 20000); // 20s is a good balance

			// initial snapshot
			queueMicrotask(async () => {
				await broadcastCounts();
				await broadcastParticipants();
				await buildAndBroadcastGraph();

				const runId = await getCurrentRunId();
				const [r] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
				if (r?.clustersJson) {
					try {
						send('summary', JSON.parse(r.clustersJson));
					} catch {}
				}
				if (r?.pairsJson) {
					const { send } = await import('$lib/server/sse');
					send('matches', JSON.parse(r.pairsJson));
				}

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
					controller.enqueue(`event: recent_lines\ndata: ${JSON.stringify(recent)}\n\n`);
				} catch {
					/* ignore */
				}
			});

			// remember to clear heartbeat when client disconnects
			(controller as any)._hb = hb;
		},
		cancel(controller) {
			const hb = (controller as any)._hb as ReturnType<typeof setInterval> | undefined;
			if (hb) clearInterval(hb);
			removeSubscriber(controller);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform', // <- important
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no' // harmless outside nginx, helps when present
		}
	});
};
