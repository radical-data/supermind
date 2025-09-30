import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { submissions, runs } from '$lib/server/db/schema';
import { getCurrentRunId } from '$lib/server';
import { summariseThemes } from '$lib/server/llm';
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { send } from '$lib/server/sse';

export const POST: RequestHandler = async () => {
	const runId = await getCurrentRunId();
	const rows = await db.select().from(submissions).where(eq(submissions.runId, runId));
	if (!rows.length) {
		console.warn('[summary] No submissions for run', runId);
		throw error(400, 'No submissions');
	}

	const items = rows.map((r) => {
		const p = JSON.parse(r.payloadJson);
		const text =
			typeof p?.text === 'string'
				? p.text
				: [p?.fact, p?.constraint, p?.hope].filter(Boolean).join(' ');
		return { id: r.participantId, text };
	});

	console.log('[summary] Calling summariseThemes for', items.length, 'items');
	const summary = await summariseThemes(items);
	console.log('[summary] Got summary:', {
		themes: summary.themes.length,
		contradictions: summary.contradictions.length,
		outliers: summary.outliers.length
	});

	await db
		.update(runs)
		.set({ clustersJson: JSON.stringify(summary) })
		.where(eq(runs.id, runId));
	console.log('[summary] Saved to runs.clustersJson for run', runId);

	send('summary', summary);
	console.log('[summary] Broadcasted via SSE');
	return json({ ok: true });
};
