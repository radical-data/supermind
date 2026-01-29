import { error } from "@sveltejs/kit";
import { eq, inArray } from "drizzle-orm";
import { getCurrentRunId } from "$lib/server";
import { jsonNoStore } from "$lib/server/admin";
import { getDB } from "$lib/server/db";
import {
	normalised,
	participants,
	runs,
	submissions,
} from "$lib/server/db/schema";
import { send } from "$lib/server/sse";

type Vec = number[];

const cosine = (a: Vec, b: Vec) => {
	let dot = 0,
		na = 0,
		nb = 0;
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const ai = a[i] ?? 0,
			bi = b[i] ?? 0;
		dot += ai * bi;
		na += ai * ai;
		nb += bi * bi;
	}
	return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

export async function matchAction() {
	const db = getDB();
	const runId = await getCurrentRunId();

	const people = await db.select().from(participants);
	if (!people.length) throw error(400, "No participants");

	const subs = await db
		.select()
		.from(submissions)
		.where(eq(submissions.runId, runId));
	if (!subs.length) throw error(400, "No submissions for this run");

	const subIds = subs.map((s) => s.id);
	const norms = subIds.length
		? await db
				.select()
				.from(normalised)
				.where(inArray(normalised.submissionId, subIds))
		: [];

	const byPidEmbeds = new Map<number, Vec[]>();
	for (const s of subs) {
		const n = norms.find((x) => x.submissionId === s.id);
		if (!n?.embeddingJson) continue;
		const v = JSON.parse(n.embeddingJson) as number[];
		const existing = byPidEmbeds.get(s.participantId);
		if (existing) {
			existing.push(v);
		} else {
			byPidEmbeds.set(s.participantId, [v]);
		}
	}
	const pidToVec = new Map<number, Vec>(
		[...byPidEmbeds].map(([pid, arr]) => [pid, mean(arr)]),
	);

	const withVec = people.filter((p) => pidToVec.has(p.id));

	type Edge = { u: number; v: number; s: number };
	const edges: Edge[] = [];
	for (let i = 0; i < withVec.length; i++) {
		for (let j = i + 1; j < withVec.length; j++) {
			const u = withVec[i],
				v = withVec[j];
			const uVec = pidToVec.get(u.id);
			const vVec = pidToVec.get(v.id);
			if (!uVec || !vVec) continue;
			edges.push({
				u: u.id,
				v: v.id,
				s: +cosine(uVec, vVec).toFixed(4),
			});
		}
	}
	edges.sort((a, b) => b.s - a.s);

	const used = new Set<number>();
	const pairs: Array<{ members: number[]; score: number }> = [];
	for (const e of edges) {
		if (used.has(e.u) || used.has(e.v)) continue;
		used.add(e.u);
		used.add(e.v);
		pairs.push({ members: [e.u, e.v], score: e.s });
	}

	const leftover = people.map((p) => p.id).filter((id) => !used.has(id));
	// If one unpaired remains, append to best-matching pair (forms a trio).
	if (leftover.length % 2 === 1 && pairs.length) {
		const solo = leftover.pop();
		if (solo === undefined) throw error(500, "Pairing logic error");
		let bestIdx = 0,
			bestScore = -1;
		for (let i = 0; i < pairs.length; i++) {
			const m = pairs[i].members;
			const sims = m.map((id) =>
				(() => {
					const a = pidToVec.get(id);
					const b = pidToVec.get(solo);
					if (!a || !b) return 0;
					return cosine(a, b);
				})(),
			);
			const avg = sims.length
				? sims.reduce((a, b) => a + b, 0) / sims.length
				: 0;
			if (avg > bestScore) {
				bestScore = avg;
				bestIdx = i;
			}
		}
		pairs[bestIdx].members.push(solo);
	}

	for (let i = 0; i + 1 < leftover.length; i += 2) {
		pairs.push({ members: [leftover[i], leftover[i + 1]], score: 0 });
	}
	if (leftover.length % 2 === 1) {
		pairs.push({ members: [leftover[leftover.length - 1]], score: 0 });
	}
	const idToName = new Map(people.map((p) => [p.id, p.name]));
	const payload = {
		pairs: pairs.map((g) => ({
			members: g.members,
			score: g.score,
			names: g.members.map((id) => idToName.get(id) ?? `#${id}`),
		})),
	};

	await db
		.update(runs)
		.set({ pairsJson: JSON.stringify(payload) })
		.where(eq(runs.id, runId));
	send("matches", payload);
	return jsonNoStore({ ok: true, ...payload });
}

const mean = (arrs: Vec[]): Vec => {
	if (!arrs.length) return [];
	const dim = Math.max(...arrs.map((v) => v.length));
	const out = new Array(dim).fill(0);
	for (const v of arrs) for (let i = 0; i < dim; i++) out[i] += v[i] ?? 0;
	for (let i = 0; i < dim; i++) out[i] /= arrs.length;
	return out;
};
