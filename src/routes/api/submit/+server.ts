import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { submissions, normalised } from '$lib/server/db/schema';
import { getCurrentRunId } from '$lib/server';
import { json, error } from '@sveltejs/kit';
import { broadcastCounts, send } from '$lib/server/sse';
import { buildAndBroadcastGraph } from '$lib/server/graph';
import { getEmbedding } from '$lib/server/llm';

function extractText(payload: any): string {
	// Prefer single-line payload
	if (typeof payload?.text === 'string') return payload.text.trim();
	// Back-compat for old triad shape
	return [payload?.fact, payload?.constraint, payload?.hope].filter(Boolean).join(' ').trim();
}

function normaliseLine(payload: any) {
	const text = extractText(payload);
	return {
		clean_text: text,
		tags: [],
		stances: {},
		red_flags: []
	};
}

export const POST: RequestHandler = async ({ request }) => {
	const { participantId, kind = 'line', payload } = await request.json();
	if (!participantId || !payload) throw error(400, 'Bad input');

	const runId = await getCurrentRunId();
	const [sub] = await db
		.insert(submissions)
		.values({
			runId,
			participantId,
			kind,
			payloadJson: JSON.stringify(payload)
		})
		// ⬇️ no upsert — we want multiple rows per participant
		.returning({ id: submissions.id });

	const text = extractText(payload);
	const dataJson = JSON.stringify(normaliseLine(payload));
	const embedding = await getEmbedding(text);

	await db
		.insert(normalised)
		.values({ submissionId: sub.id, dataJson, embeddingJson: JSON.stringify(embedding) });

	await broadcastCounts();
	await buildAndBroadcastGraph();

	send('line', { submissionId: sub.id, participantId, text });

	return json({ ok: true, submissionId: sub.id });
};
