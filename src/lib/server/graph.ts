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

// add helper to mirror the one in /api/stream
function extractText(payload: any): string {
	if (typeof payload?.text === 'string') return payload.text.trim();
	return [payload?.fact, payload?.constraint, payload?.hope].filter(Boolean).join(' ').trim();
}

export async function buildAndBroadcastGraph(threshold = 0.65, topK = 3) {
	const runId = await getCurrentRunId();

	const people = await db.select().from(participants);
	const subs = await db.select().from(submissions).where(eq(submissions.runId, runId));
	const norms = await db.select().from(normalised);

	// map subId -> embedding
	const embedBySub = new Map(
		norms.map((n) => [n.submissionId, JSON.parse(n.embeddingJson ?? '[]') as number[]])
	);

	// latest submission *text* per participant (by created order / id)
	const latestText = new Map<number, string>();
	for (const s of subs) {
		const p = JSON.parse(s.payloadJson ?? '{}');
		latestText.set(s.participantId, extractText(p));
	}

	// one embedding per participant (take the latest we saw)
	const embedByPid = new Map<number, number[]>();
	for (const s of subs) {
		const v = embedBySub.get(s.id);
		if (v) embedByPid.set(s.participantId, v);
	}

	// ⬅️ now include both name (label) and latest submission (text)
	const nodes = people.map((p) => ({
		id: p.id,
		label: p.name,
		text: latestText.get(p.id) ?? '', // used by the front-end when showing text
		group: 1
	}));
	const ids = nodes.map((n) => n.id);

	// pairwise sims, keep topK per node above threshold
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
	const links: { source: number; target: number; value: number }[] = [];
	for (const l of cand) {
		const k = key(l.source, l.target);
		if (!seen.has(k)) {
			seen.add(k);
			links.push(l);
		}
	}

	// 🔁 fail-safe: if no links, relax and connect nearest neighbour per node
	if (!links.length && ids.length >= 2) {
		for (let i = 0; i < ids.length; i++) {
			const ei = embedByPid.get(ids[i]);
			if (!ei) continue;
			let best: { j: number; s: number } | null = null;
			for (let j = 0; j < ids.length; j++) {
				if (i === j) continue;
				const ej = embedByPid.get(ids[j]);
				if (!ej) continue;
				const s = cosine(ei, ej);
				if (!best || s > best.s) best = { j: ids[j], s };
			}
			if (best) {
				const k = key(ids[i], best.j);
				if (!seen.has(k)) {
					seen.add(k);
					links.push({ source: ids[i], target: best.j, value: +best.s.toFixed(2) });
				}
			}
		}
	}

	send('graph', { nodes, links });
}
