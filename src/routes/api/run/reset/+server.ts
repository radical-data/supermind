import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { resetRun } from '$lib/server';

export const POST: RequestHandler = async () => {
	const id = await resetRun();
	return json({ ok: true, runId: id });
};
