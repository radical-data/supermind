import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
const db = getDB();
import { participants } from '$lib/server/db/schema';
import { json, error } from '@sveltejs/kit';
import { broadcastParticipants } from '$lib/server/sse';

export const POST: RequestHandler = async ({ request }) => {
	const { name } = await request.json();
	if (!name || typeof name !== 'string' || !name.trim()) throw error(400, 'Name required');

	const [p] = await db
		.insert(participants)
		.values({ name: name.trim() }) // ← no tableSide
		.returning({ id: participants.id });

	await broadcastParticipants();

	return json({ participantId: p.id });
};
