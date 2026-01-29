import { env } from "$env/dynamic/private";
import type { SummaryJSON } from "$lib/types";

// ————— Embeddings —————
export async function getEmbedding(text: string): Promise<number[]> {
	if (!env.LLM_API_KEY) {
		console.warn("[embed] No LLM_API_KEY set — using cheapHashEmbed");
		return cheapHashEmbed(text);
	}
	const model = env.EMBED_MODEL ?? "text-embedding-3-small";
	try {
		const res = await fetch("https://api.openai.com/v1/embeddings", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${env.LLM_API_KEY}`,
			},
			body: JSON.stringify({ model, input: text }),
		});
		if (!res.ok) {
			const body = await res.text();
			console.error("[embed] OpenAI error", res.status, body);
			return cheapHashEmbed(text);
		}
		const j = await res.json();
		return j?.data?.[0]?.embedding ?? cheapHashEmbed(text);
	} catch (e) {
		console.error("[embed] Exception", e);
		return cheapHashEmbed(text);
	}
}

function cheapHashEmbed(s: string, dim = 64): number[] {
	const v = new Array(dim).fill(0);
	for (let i = 0; i < s.length; i++) v[i % dim] += (s.charCodeAt(i) % 13) - 6;
	const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
	return v.map((x) => x / n);
}

// ————— Summary —————
export async function summariseThemes(
	items: { id: number; text: string }[],
): Promise<SummaryJSON> {
	if (!env.LLM_API_KEY) {
		console.warn("[summary] No LLM_API_KEY set — using heuristicSummary");
		return heuristicSummary(items);
	}

	// Strict schema + caps keep it concise and machine-safe.
	const sys = `
You are facilitating a 6–8 minute meeting synthesis about "the future of Rail Cargo" in the Netherlands.
Participants answered: "What heroic deeds are you working on to change the future of Rail Cargo?"
Treat "heroic deeds" as concrete initiatives, campaigns, partnerships, pilots, improvements, or changes they are actively driving (avoid hype).

Important: Rail Cargo work includes both "hard" delivery (operations/tech/assets) and "soft" enablers (customers/market adoption, policy/regulation, stakeholder alignment, communications, funding, partnerships, reputation, modal-shift advocacy).

Input is an array of {id:number, text:string}. IDs are participant IDs.

Return ONLY valid JSON with this exact shape (no extra keys):
{
  "themes": [
    {
      "label": "max 6 words",
      "why": "1 short sentence",
      "members": [ids...],
      "examples": [{"participantId": id, "text": "≤100 chars"}]
    }
  ],
  "contradictions": [{"a": id, "b": id, "explain": "≤120 chars"}],
  "outliers": [{"participantId": id, "explain": "≤120 chars"}],
  "agenda": [{"title": "≤10 words", "rationale": "≤120 chars", "refs": [ids...]}],
  "tone": {"mood": "≤6 words", "evidence": [ids...]},
  "stats": {"count": number}
}

Rules:
- 3–6 themes. Each theme must represent an initiative area relevant to Rail Cargo, including:
  - delivery: reliability, capacity, terminals/yards, asset utilisation, safety, digitalisation, sustainability, cost
  - adoption: customer acquisition/retention, service design, value proposition, pricing, sales enablement
  - enabling environment: policy/regulation, permits, subsidy/funding, stakeholder alignment (ports/terminals/operators/ProRail), communications and sector reputation
- "label" should read like an initiative, not a vague topic (e.g. "Winning new shipper lanes", not "Customers").
- "why" should state the shared intended impact in plain language (reliability, lead-time, capacity, cost, safety, emissions, customer adoption, modal shift, political support).
- "members" must be participant IDs whose text supports the theme.
- "examples" must quote EXACT text from provided items and use correct participantId. 0–2 per theme.
- 0–3 contradictions; capture meaningful strategic tensions (e.g. standardise vs local optimise; speed vs energy; openness vs commercial sensitivity; automation vs safety; growth vs service reliability; advocacy vs neutrality). No nitpicks and do not invent conflicts.
- 0–2 outliers; explain why they’re different or off-topic.
- "agenda" should contain 2–4 concrete discussion items that humans can act on NOW:
  - prioritise: (1) resolve the biggest trade-off, (2) decide one next step/pilot or campaign with an owner and success metric, (3) remove one blocker (data, integration, governance, safety case, policy constraint, stakeholder alignment).
- Keep language crisp; no bullet symbols; no markdown; no commentary outside JSON.
`;

	const user = JSON.stringify(items);
	const model = env.SUMMARY_MODEL ?? "gpt-4o-mini";

	try {
		const res = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${env.LLM_API_KEY}`,
			},
			body: JSON.stringify({
				model,
				response_format: { type: "json_object" },
				messages: [
					{ role: "system", content: sys },
					{ role: "user", content: user },
				],
				temperature: 0.2,
			}),
		});
		if (!res.ok) {
			const body = await res.text();
			console.error("[summary] OpenAI error", res.status, body);
			return heuristicSummary(items);
		}
		const j = await res.json();
		const content = j?.choices?.[0]?.message?.content ?? "{}";
		const parsed = JSON.parse(content);

		// Lightweight sanitation to guarantee required fields exist
		const safe: SummaryJSON = {
			themes: Array.isArray(parsed.themes) ? parsed.themes : [],
			contradictions: Array.isArray(parsed.contradictions)
				? parsed.contradictions
				: [],
			outliers: Array.isArray(parsed.outliers) ? parsed.outliers : [],
			agenda: Array.isArray(parsed.agenda) ? parsed.agenda : [],
			tone: parsed.tone ?? undefined,
			stats: parsed.stats ?? { count: items.length },
		};
		return safe;
	} catch (e) {
		console.error("[summary] Exception", e);
		return heuristicSummary(items);
	}
}

// ————— Heuristic fallback —————
function heuristicSummary(items: { id: number; text: string }[]): SummaryJSON {
	// ultra-simple: use word overlap cosine in cheap embedding space
	const embeds = items.map((i) => ({
		id: i.id,
		v: cheapHashEmbed(i.text, 64),
	}));
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

	// Minimal agenda heuristic
	const agenda = clusters
		.slice(0, 2)
		.filter((m) => m.length >= 2)
		.map((m, i) => ({
			title: `Clarify Theme ${i + 1}`,
			rationale: "High interest cluster; define next steps.",
			refs: m.slice(0, 4),
		}));

	return {
		themes: clusters.map((m, i) => ({ label: `Theme ${i + 1}`, members: m })),
		contradictions: [],
		outliers: out
			? [{ participantId: out, explain: "Least similar to any theme" }]
			: [],
		agenda,
		tone: {
			mood: "Mixed curiosity",
			evidence: embeds.slice(0, 3).map((e) => e.id),
		},
		stats: { count: items.length },
	};
}
