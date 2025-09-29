import { env } from '$env/dynamic/private';

// ————— Embeddings —————
export async function getEmbedding(text: string): Promise<number[]> {
	if (!env.LLM_API_KEY) return cheapHashEmbed(text); // offline fallback
	const model = env.EMBED_MODEL ?? 'text-embedding-3-small';
	const res = await fetch('https://api.openai.com/v1/embeddings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
		body: JSON.stringify({ model, input: text })
	});
	const j = await res.json();
	return j?.data?.[0]?.embedding ?? cheapHashEmbed(text);
}

function cheapHashEmbed(s: string, dim = 64): number[] {
	const v = new Array(dim).fill(0);
	for (let i = 0; i < s.length; i++) v[i % dim] += (s.charCodeAt(i) % 13) - 6;
	// L2-normalise
	const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
	return v.map((x) => x / n);
}

// ————— Summary —————
export type SummaryJSON = {
	themes: { label: string; why?: string; members: number[] }[];
	contradictions: { a: number; b: number; explain: string }[];
	outliers: { participantId: number; explain: string }[];
	stats?: { count: number };
};

export async function summariseThemes(items: { id: number; text: string }[]): Promise<SummaryJSON> {
	if (!env.LLM_API_KEY) return heuristicSummary(items);

	const sys = `You cluster short lines about AI & logistics. 
Return ONLY valid JSON with keys: themes (3-6), contradictions (0-3), outliers (0-2), stats.count.`;
	const user = JSON.stringify(items);

	const model = env.SUMMARY_MODEL ?? 'gpt-4o-mini';

	const res = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
		body: JSON.stringify({
			model,
			response_format: { type: 'json_object' },
			messages: [
				{ role: 'system', content: sys },
				{ role: 'user', content: user }
			],
			temperature: 0.2
		})
	});
	const j = await res.json();
	const content = j?.choices?.[0]?.message?.content ?? '{}';

	try {
		const parsed = JSON.parse(content);
		return {
			themes: parsed.themes ?? [],
			contradictions: parsed.contradictions ?? [],
			outliers: parsed.outliers ?? [],
			stats: parsed.stats ?? { count: items.length }
		};
	} catch {
		// retry once, then fallback
		return heuristicSummary(items);
	}
}

// ————— Heuristic fallback —————
function heuristicSummary(items: { id: number; text: string }[]): SummaryJSON {
	// ultra-simple: use word overlap cosine in cheap embedding space
	const embeds = items.map((i) => ({ id: i.id, v: cheapHashEmbed(i.text, 64) }));
	const cos = (a: number[], b: number[]) => {
		let dot = 0,
			na = 0,
			nb = 0;
		for (let i = 0; i < a.length; i++) {
			dot += a[i] * b[i];
			na += a[i] * a[i];
			nb += b[i] * b[i];
		}
		return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
	};

	// 3 crude clusters: pick 3 seeds then greedy assign
	const seeds = embeds.slice(0, Math.min(3, embeds.length)).map((e) => e.v);
	const clusters: number[][] = seeds.map(() => []);
	for (const e of embeds) {
		let best = 0,
			bestS = -1;
		for (let k = 0; k < seeds.length; k++) {
			const s = cos(e.v, seeds[k]);
			if (s > bestS) {
				bestS = s;
				best = k;
			}
		}
		clusters[best].push(e.id);
	}
	// outlier = farthest from its seed
	let out: number | null = null,
		outScore = 1;
	embeds.forEach((e) => {
		const s = Math.max(...seeds.map((sd) => cos(e.v, sd)));
		if (s < outScore) {
			outScore = s;
			out = e.id;
		}
	});

	return {
		themes: clusters.map((m, i) => ({
			label: `Theme ${i + 1}`,
			members: m
		})),
		contradictions: [],
		outliers: out ? [{ participantId: out, explain: 'Least similar to any theme' }] : [],
		stats: { count: items.length }
	};
}
