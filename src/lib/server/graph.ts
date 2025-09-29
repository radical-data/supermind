import { db } from '$lib/server/db';
import { participants, submissions, normalised } from '$lib/server/db/schema';
import { getCurrentRunId } from '.';
import { send } from './sse';
import { eq } from 'drizzle-orm';

function cosine(a: number[], b: number[]) {
	let dot = 0,
		na = 0,
		nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function buildAndBroadcastGraph(threshold = 0.78, topK = 3) {
	const runId = await getCurrentRunId();

	const people = await db.select().from(participants);
	const subs = await db.select().from(submissions).where(eq(submissions.runId, runId));
	const norms = await db.select().from(normalised);

	const embedBySub = new Map(
		norms.map((n) => [n.submissionId, JSON.parse(n.embeddingJson ?? '[]') as number[]])
	);
	const embedByPid = new Map<number, number[]>();
	subs.forEach((s) => {
		const v = embedBySub.get(s.id);
		if (v) embedByPid.set(s.participantId, v);
	});

	const nodes = people.map((p) => ({ id: p.id, label: p.name, table: p.tableSide }));
	const ids = nodes.map((n) => n.id);

	// compute pairwise sims, keep topK per node
	const cand: { source: number; target: number; value: number }[] = [];
	for (let i = 0; i < ids.length; i++) {
		const ei = embedByPid.get(ids[i]);
		if (!ei) continue;
		const row: { j: number; s: number }[] = [];
		for (let j = 0; j < ids.length; j++) {
			if (i === j) continue;
			const ej = embedByPid.get(ids[j]);
			if (!ej) continue;
			row.push({ j: ids[j], s: cosine(ei, ej) });
		}
		row.sort((a, b) => b.s - a.s);
		for (const r of row.slice(0, topK))
			if (r.s >= threshold) cand.push({ source: ids[i], target: r.j, value: +r.s.toFixed(2) });
	}

	// de-duplicate undirected
	const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
	const seen = new Set<string>();
	const links = [];
	for (const l of cand) {
		const k = key(l.source, l.target);
		if (!seen.has(k)) {
			seen.add(k);
			links.push(l);
		}
	}

	send('graph', { nodes, links });
}
