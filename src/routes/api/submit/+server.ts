import { getDB } from "$lib/server/db";
import type { SubmissionPayload } from "$lib/types";
import type { RequestHandler } from "./$types";

const db = getDB();

import { error, json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { getCurrentRunId } from "$lib/server";
import { normalised, participants, submissions } from "$lib/server/db/schema"; // ← add participants
import { buildAndBroadcastGraph } from "$lib/server/graph";
import { getEmbedding } from "$lib/server/llm";
import { broadcastCounts, send } from "$lib/server/sse";

function extractText(payload: unknown): string {
	const p = (payload ?? {}) as SubmissionPayload;
	if (typeof p.text === "string") return p.text.trim();
	return [p.fact, p.constraint, p.hope]
		.filter(Boolean)
		.map(String)
		.join(" ")
		.trim();
}

function normaliseLine(payload: unknown) {
	const text = extractText(payload);
	return { clean_text: text, tags: [], stances: {}, red_flags: [] };
}

export const POST: RequestHandler = async ({ request }) => {
	const { participantId, kind = "line", payload } = await request.json();
	if (!participantId || !payload) throw error(400, "Bad input");

	// ✅ Guard: participant must exist (protects against stale sessionStorage pid)
	const [p] = await db
		.select({ id: participants.id })
		.from(participants)
		.where(eq(participants.id, Number(participantId)))
		.limit(1);
	if (!p) throw error(400, "unknown_participant");

	const runId = await getCurrentRunId();

	// Insert submission
	const [sub] = await db
		.insert(submissions)
		.values({
			runId,
			participantId,
			kind,
			payloadJson: JSON.stringify(payload),
		})
		.returning({ id: submissions.id });

	// Normalise + embed
	const text = extractText(payload);
	const dataJson = JSON.stringify(normaliseLine(payload));
	const embedding = await getEmbedding(text);
	await db.insert(normalised).values({
		submissionId: sub.id,
		dataJson,
		embeddingJson: JSON.stringify(embedding),
	});

	// Live updates
	await broadcastCounts();
	await buildAndBroadcastGraph();
	send("line", { submissionId: sub.id, participantId, text });

	return json({ ok: true, submissionId: sub.id });
};
