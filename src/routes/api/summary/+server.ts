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
	if (!rows.length) throw error(400, 'No submissions');

	const items = rows.map((r) => {
		const p = JSON.parse(r.payloadJson);
		const text =
			typeof p?.text === 'string'
				? p.text
				: [p?.fact, p?.constraint, p?.hope].filter(Boolean).join(' ');
		return { id: r.participantId, text };
	});

	const summary = await summariseThemes(items);

	await db
		.update(runs)
		.set({ clustersJson: JSON.stringify(summary) })
		.where(eq(runs.id, runId));

	send('summary', summary);
	return json({ ok: true });
};
