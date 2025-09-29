import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { participants } from '$lib/server/db/schema';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
	const { name, tableSide } = await request.json();
	if (!name || !tableSide || !['A', 'B'].includes(tableSide)) throw error(400, 'Bad input');
	const [p] = await db
		.insert(participants)
		.values({ name, tableSide })
		.returning({ id: participants.id });
	return json({ participantId: p.id });
};
