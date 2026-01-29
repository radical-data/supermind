import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { getCurrentRunId } from "$lib/server";
import { jsonNoStore } from "$lib/server/admin";
import { getDB } from "$lib/server/db";
import { runs, submissions } from "$lib/server/db/schema";
import { summariseThemes } from "$lib/server/llm";
import { send } from "$lib/server/sse";

const DEBUG_SUMMARY = process.env.NODE_ENV !== "production";

export async function summariseAction() {
	const db = getDB();
	const runId = await getCurrentRunId();
	const rows = await db
		.select()
		.from(submissions)
		.where(eq(submissions.runId, runId));
	if (!rows.length) {
		if (DEBUG_SUMMARY) console.warn("[summary] No submissions for run", runId);
		throw error(400, "No submissions");
	}

	const items = rows.map((r) => {
		const p = JSON.parse(r.payloadJson);
		const text =
			typeof p?.text === "string"
				? p.text
				: [p?.fact, p?.constraint, p?.hope].filter(Boolean).join(" ");
		return { id: r.participantId, text };
	});

	if (DEBUG_SUMMARY) {
		console.log("[summary] summariseThemes on", items.length, "items");
	}
	const summary = await summariseThemes(items);

	await db
		.update(runs)
		.set({ clustersJson: JSON.stringify(summary) })
		.where(eq(runs.id, runId));

	send("summary", summary);
	if (DEBUG_SUMMARY) {
		console.log("[summary] Broadcasted summary for run", runId, {
			themes: summary.themes.length,
			contradictions: summary.contradictions.length,
			outliers: summary.outliers.length,
		});
	}
	return jsonNoStore({ ok: true });
}
