import { env } from '$env/dynamic/private';

// ————————————————— Embeddings —————————————————
export async function getEmbedding(text: string): Promise<number[]> {
	if (!env.LLM_API_KEY) {
		console.warn('[embed] No LLM_API_KEY set — using cheapHashEmbed');
		return cheapHashEmbed(text);
	}
	const model = env.EMBED_MODEL ?? 'text-embedding-3-small';
	try {
		const res = await fetch('https://api.openai.com/v1/embeddings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
			body: JSON.stringify({ model, input: text })
		});
		if (!res.ok) {
			const body = await res.text();
			console.error('[embed] OpenAI error', res.status, body);
			return cheapHashEmbed(text);
		}
		const j = await res.json();
		return j?.data?.[0]?.embedding ?? cheapHashEmbed(text);
	} catch (e) {
		console.error('[embed] Exception', e);
		return cheapHashEmbed(text);
	}
}

function cheapHashEmbed(s: string, dim = 64): number[] {
	const v = new Array(dim).fill(0);
	for (let i = 0; i < s.length; i++) v[i % dim] += (s.charCodeAt(i) % 13) - 6;
	// L2-normalise
	const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
	return v.map((x) => x / n);
}

// ————————————————— Summary —————————————————
export type SummaryJSON = {
	themes: { label: string; why?: string; members: number[] }[];
	contradictions: { a: number; b: number; explain: string }[];
	outliers: { participantId: number; explain: string }[];
	stats?: { count: number };
};

export async function summariseThemes(items: { id: number; text: string }[]): Promise<SummaryJSON> {
	if (!env.LLM_API_KEY) {
		console.warn('[summary] No LLM_API_KEY set — using heuristicSummary');
		return heuristicSummary(items);
	}

	// Be explicit about the required structure.
	const structure = {
		type: 'object',
		required: ['themes', 'contradictions', 'outliers', 'stats'],
		properties: {
			themes: {
				type: 'array',
				minItems: 3,
				maxItems: 6,
				items: {
					type: 'object',
					required: ['label', 'members'],
					properties: {
						label: { type: 'string' },
						why: { type: 'string' },
						members: {
							type: 'array',
							items: { type: 'number' }
						}
					}
				}
			},
			contradictions: {
				type: 'array',
				maxItems: 3,
				items: {
					type: 'object',
					required: ['a', 'b', 'explain'],
					properties: {
						a: { type: 'number' },
						b: { type: 'number' },
						explain: { type: 'string' }
					}
				}
			},
			outliers: {
				type: 'array',
				maxItems: 2,
				items: {
					type: 'object',
					required: ['participantId', 'explain'],
					properties: {
						participantId: { type: 'number' },
						explain: { type: 'string' }
					}
				}
			},
			stats: {
				type: 'object',
				required: ['count'],
				properties: { count: { type: 'number' } }
			}
		},
		additionalProperties: false
	};

	const sys = [
		'You are clustering very short lines about AI & logistics.',
		'Return ONLY valid JSON matching the provided JSON Schema.',
		'Write concise "label" strings; include ids of member participants in "members".',
		'Include 0–3 contradictions (pairs of participant ids) and up to 2 outliers.'
	].join(' ');

	const example = {
		themes: [
			{
				label: 'Automation helps exception handling',
				why: 'Common focus on alerts',
				members: [1, 7]
			},
			{ label: 'Worker augmentation, not replacement', members: [3] }
		],
		contradictions: [{ a: 2, b: 9, explain: 'Replace vs. augment debate' }],
		outliers: [{ participantId: 5, explain: 'Focuses on ethics rather than ops' }],
		stats: { count: items.length }
	};

	const model = env.SUMMARY_MODEL ?? 'gpt-4o-mini';

	try {
		const res = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
			body: JSON.stringify({
				model,
				response_format: { type: 'json_object' }, // ensures valid JSON
				messages: [
					{ role: 'system', content: sys },
					{
						role: 'user',
						content: [
							'JSON Schema for the required output:',
							'```json',
							JSON.stringify(structure),
							'```',
							'\nExample of the format (illustrative only):',
							'```json',
							JSON.stringify(example),
							'```',
							'\nHere are the items to cluster (array of {id,text}):',
							'```json',
							JSON.stringify(items),
							'```'
						].join('\n')
					}
				],
				temperature: 0.2
			})
		});

		if (!res.ok) {
			const body = await res.text();
			console.error('[summary] OpenAI error', res.status, body);
			return heuristicSummary(items);
		}

		const j = await res.json();
		const content = j?.choices?.[0]?.message?.content ?? '{}';

		// Parse and coerce defensively to the UI’s expected shape.
		const parsed = safeParseJSON(content) ?? {};
		return {
			themes: coerceThemes(parsed.themes),
			contradictions: coerceContradictions(parsed.contradictions),
			outliers: coerceOutliers(parsed.outliers),
			stats:
				parsed.stats && Number.isFinite(parsed.stats.count) ? parsed.stats : { count: items.length }
		};
	} catch (e) {
		console.error('[summary] Exception', e);
		return heuristicSummary(items);
	}
}

// ——— Coercion helpers ———
function safeParseJSON(s: string): any | null {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

function coerceThemes(raw: any): { label: string; why?: string; members: number[] }[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((t) => {
		// Accept strings or objects; normalise to {label, why?, members[]}
		if (typeof t === 'string') return { label: t, members: [] };
		if (t && typeof t === 'object') {
			const label = String(t.label ?? t.title ?? t.name ?? 'Theme');
			const why =
				t.why != null
					? String(t.why)
					: t.reason != null
						? String(t.reason)
						: t.explain != null
							? String(t.explain)
							: undefined;
			const members = Array.isArray(t.members)
				? t.members.filter((n: any) => Number.isFinite(n)).map((n: any) => Number(n))
				: [];
			return { label, why, members };
		}
		return { label: 'Theme', members: [] };
	});
}

function coerceContradictions(raw: any): { a: number; b: number; explain: string }[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((c) => ({
			a: Number(c?.a ?? c?.aId ?? c?.left),
			b: Number(c?.b ?? c?.bId ?? c?.right),
			explain: String(c?.explain ?? c?.why ?? c?.reason ?? '')
		}))
		.filter((c) => Number.isFinite(c.a) && Number.isFinite(c.b));
}

function coerceOutliers(raw: any): { participantId: number; explain: string }[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((o) => ({
			participantId: Number(o?.participantId ?? o?.id),
			explain: String(o?.explain ?? o?.why ?? '')
		}))
		.filter((o) => Number.isFinite(o.participantId));
}

// ————————————————— Heuristic fallback —————————————————
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
