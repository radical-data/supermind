import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
const db = getDB();
import { participants, submissions, normalised, runs } from '$lib/server/db/schema';
import { getCurrentRunId } from '$lib/server';
import { json, error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { send } from '$lib/server/sse';

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
const mean = (arrs: Vec[]): Vec => {
	if (!arrs.length) return [];
	const dim = Math.max(...arrs.map((v) => v.length));
	const out = new Array(dim).fill(0);
	for (const v of arrs) for (let i = 0; i < dim; i++) out[i] += v[i] ?? 0;
	for (let i = 0; i < dim; i++) out[i] /= arrs.length;
	return out;
};

export const POST: RequestHandler = async () => {
	const runId = await getCurrentRunId();

	const people = await db.select().from(participants);
	if (!people.length) throw error(400, 'No participants');

	const subs = await db.select().from(submissions).where(eq(submissions.runId, runId));
	if (!subs.length) throw error(400, 'No submissions for this run');

	const subIds = subs.map((s) => s.id);
	const norms = subIds.length
		? await db.select().from(normalised).where(inArray(normalised.submissionId, subIds))
		: [];

	// Average embedding per participant for this run
	const byPidEmbeds = new Map<number, Vec[]>();
	for (const s of subs) {
		const n = norms.find((x) => x.submissionId === s.id);
		if (!n?.embeddingJson) continue;
		const v = JSON.parse(n.embeddingJson) as number[];
		(
			byPidEmbeds.get(s.participantId) ?? byPidEmbeds.set(s.participantId, []).get(s.participantId)!
		).push(v);
	}
	const pidToVec = new Map<number, Vec>([...byPidEmbeds].map(([pid, arr]) => [pid, mean(arr)]));

	const withVec = people.filter((p) => pidToVec.has(p.id));
	const noVec = people.filter((p) => !pidToVec.has(p.id));

	// Build all scored edges among withVec
	type Edge = { u: number; v: number; s: number };
	const edges: Edge[] = [];
	for (let i = 0; i < withVec.length; i++) {
		for (let j = i + 1; j < withVec.length; j++) {
			const u = withVec[i],
				v = withVec[j];
			edges.push({
				u: u.id,
				v: v.id,
				s: +cosine(pidToVec.get(u.id)!, pidToVec.get(v.id)!).toFixed(4)
			});
		}
	}
	edges.sort((a, b) => b.s - a.s);

	// Greedy disjoint pairing
	const used = new Set<number>();
	const pairs: Array<{ members: number[]; score: number }> = [];
	for (const e of edges) {
		if (used.has(e.u) || used.has(e.v)) continue;
		used.add(e.u);
		used.add(e.v);
		pairs.push({ members: [e.u, e.v], score: e.s });
	}

	// Leftovers from withVec plus all noVec
	const leftover = people.map((p) => p.id).filter((id) => !used.has(id));
	// If odd count, attach the last solo to the weakest existing pair → trio
	if (leftover.length % 2 === 1 && pairs.length) {
		const solo = leftover.pop()!;
		// attach to the pair with best average similarity (or just the last pair as a simple rule)
		let bestIdx = 0,
			bestScore = -1;
		for (let i = 0; i < pairs.length; i++) {
			const m = pairs[i].members;
			const sims = m.map((id) =>
				pidToVec.has(id) && pidToVec.has(solo) ? cosine(pidToVec.get(id)!, pidToVec.get(solo)!) : 0
			);
			const avg = sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : 0;
			if (avg > bestScore) {
				bestScore = avg;
				bestIdx = i;
			}
		}
		pairs[bestIdx].members.push(solo);
	}

	// Pair any remaining leftovers arbitrarily
	for (let i = 0; i + 1 < leftover.length; i += 2) {
		pairs.push({ members: [leftover[i], leftover[i + 1]], score: 0 });
	}
	if (leftover.length % 2 === 1) {
		// truly last solo (edge case when there were no pairs to form a trio)
		pairs.push({ members: [leftover[leftover.length - 1]], score: 0 });
	}

	// Decorate with names for UI
	const idToName = new Map(people.map((p) => [p.id, p.name]));
	const payload = {
		pairs: pairs.map((g) => ({
			members: g.members,
			score: g.score,
			names: g.members.map((id) => idToName.get(id) ?? `#${id}`)
		}))
	};

	await db
		.update(runs)
		.set({ pairsJson: JSON.stringify(payload) })
		.where(eq(runs.id, runId));
	send('matches', payload);
	return json({ ok: true, ...payload });
};
