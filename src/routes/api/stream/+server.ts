import { eq } from "drizzle-orm";
import { getCurrentRunId } from "$lib/server";
import { getDB } from "$lib/server/db";
import { runs, submissions } from "$lib/server/db/schema";
import { buildAndBroadcastGraph } from "$lib/server/graph";
import {
	addSubscriber,
	broadcastCounts,
	broadcastParticipants,
	removeSubscriber,
	send,
} from "$lib/server/sse";
import type { SubmissionPayload } from "$lib/types";
import type { RequestHandler } from "./$types";

/** Small helper: get display text from a submission payload */
function extractText(payload: unknown): string {
	const p = (payload ?? {}) as SubmissionPayload;
	// Prefer single-line payload
	if (typeof p.text === "string") return p.text.trim();
	// Back-compat for old triad shape
	return [p.fact, p.constraint, p.hope]
		.filter(Boolean)
		.map(String)
		.join(" ")
		.trim();
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
				const db = getDB();
				await broadcastCounts();
				await broadcastParticipants();
				await buildAndBroadcastGraph();

				const runId = await getCurrentRunId();
				const [r] = await db
					.select()
					.from(runs)
					.where(eq(runs.id, runId))
					.limit(1);
				if (r?.clustersJson) {
					try {
						send("summary", JSON.parse(r.clustersJson));
					} catch {}
				}
				if (r?.pairsJson) {
					const { send } = await import("$lib/server/sse");
					send("matches", JSON.parse(r.pairsJson));
				}

				try {
					const rows = await db
						.select()
						.from(submissions)
						.where(eq(submissions.runId, runId));
					const recent = rows.slice(-10).map((row) => {
						const payload = JSON.parse(row.payloadJson ?? "{}");
						return {
							submissionId: row.id,
							participantId: row.participantId,
							text: extractText(payload),
						};
					});
					controller.enqueue(
						`event: recent_lines\ndata: ${JSON.stringify(recent)}\n\n`,
					);
				} catch {
					/* ignore */
				}
			});

			// remember to clear heartbeat when client disconnects
			type ControllerWithHb = ReadableStreamDefaultController<string> & {
				_hb?: ReturnType<typeof setInterval>;
			};
			(controller as ControllerWithHb)._hb = hb;
		},
		cancel(controller) {
			const c = controller as ReadableStreamDefaultController<string> & {
				_hb?: ReturnType<typeof setInterval>;
			};
			if (c._hb) clearInterval(c._hb);
			removeSubscriber(controller);
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform", // <- important
			Connection: "keep-alive",
			"X-Accel-Buffering": "no", // harmless outside nginx, helps when present
		},
	});
};
