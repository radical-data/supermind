import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getCurrentRunId } from '$lib/server';

export const GET: RequestHandler = async () => json({ runId: await getCurrentRunId() });
