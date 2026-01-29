import { resetRun } from '$lib/server';
import { jsonNoStore } from '$lib/server/admin';

export async function resetRunAction() {
	const id = await resetRun();
	return jsonNoStore({ ok: true, runId: id });
}

