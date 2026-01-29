import { error, json } from "@sveltejs/kit";
import { getDB } from "$lib/server/db";
import { participants } from "$lib/server/db/schema";
import { broadcastParticipants } from "$lib/server/sse";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
	const db = getDB();
	const { name } = await request.json();
	if (!name || typeof name !== "string" || !name.trim())
		throw error(400, "Name required");

	const [p] = await db
		.insert(participants)
		.values({ name: name.trim() }) // ← no tableSide
		.returning({ id: participants.id });

	await broadcastParticipants();

	return json({ participantId: p.id });
};
