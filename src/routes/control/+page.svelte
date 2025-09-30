<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let es: EventSource | null = null;

	// Live counters/status
	let submissionCount = 0;
	let summarising = false;
	let okMsg = '';
	let errMsg = '';
	let lastSummaryAt: Date | null = null;

	// Preview of current summary (if any)
	let themes: any[] = [];
	let contradictions: any[] = [];
	let agenda: any[] = [];
	$: void 0;

	async function summarise() {
		summarising = true;
		okMsg = '';
		errMsg = '';
		try {
			const r = await fetch('/api/summary', { method: 'POST' });
			if (!r.ok) {
				const text = await r.text();
				throw new Error(text || `HTTP ${r.status}`);
			}
			okMsg = 'Summary sent ✓';
			setTimeout(() => (okMsg = ''), 2000);
		} catch (e: any) {
			errMsg = `Failed to summarise: ${e?.message ?? e}`;
		} finally {
			summarising = false;
		}
	}

	onMount(() => {
		es = new EventSource('/api/stream');
		es.addEventListener('submission_count', (e: MessageEvent) => {
			const d = JSON.parse(e.data);
			submissionCount = d.count ?? 0;
		});
		es.addEventListener('summary', (e: MessageEvent) => {
			const s = JSON.parse(e.data);
			themes = s.themes ?? [];
			contradictions = s.contradictions ?? [];
			agenda = s.agenda ?? [];
			lastSummaryAt = new Date();
		});
	});
	onDestroy(() => es?.close());
</script>

<div class="min-h-screen bg-black p-6 text-white">
	<div class="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
		<!-- Nav cards -->
		<a
			href="/join"
			class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 transition hover:bg-white/10"
			>Join page</a
		>
		<a
			href="/input"
			class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 transition hover:bg-white/10"
			>Input page</a
		>
		<a
			href="/visualiser"
			class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 transition hover:bg-white/10"
			>Visualiser</a
		>
	</div>

	<div class="mx-auto mt-6 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
		<!-- Live status -->
		<div class="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
			<div class="text-sm opacity-70">Submissions</div>
			<div class="text-5xl leading-none font-extrabold">{submissionCount}</div>
			<div class="mt-1 text-xs opacity-60">live</div>

			<div class="mt-5">
				<button
					class="w-full rounded-xl bg-white/90 px-4 py-3 font-medium text-black transition hover:bg-white disabled:opacity-60"
					on:click={summarise}
					disabled={summarising}
				>
					{#if summarising}
						<span class="inline-flex items-center gap-2">
							<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
								<circle
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-opacity="0.2"
									stroke-width="4"
								/>
								<path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" stroke-width="4" />
							</svg>
							Summarising…
						</span>
					{:else}
						Summarise now
					{/if}
				</button>

				{#if okMsg}
					<div class="mt-3 rounded-lg bg-green-500/15 px-3 py-2 text-sm text-green-300">
						{okMsg}
					</div>
				{/if}
				{#if errMsg}
					<div class="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{errMsg}</div>
				{/if}

				<div class="mt-3 text-xs opacity-70">
					{#if lastSummaryAt}
						Last summary: {lastSummaryAt.toLocaleTimeString()}
					{:else}
						No summary yet
					{/if}
				</div>
			</div>
		</div>

		<!-- Themes preview -->
		<div class="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 md:col-span-2">
			<h2 class="mb-3 text-lg font-semibold">Summary preview</h2>
			<div class="grid gap-4 md:grid-cols-2">
				<div>
					<div class="mb-2 text-sm opacity-70">Themes</div>
					<ul class="space-y-2 text-sm leading-relaxed">
						{#each themes as t}
							<li class="rounded-lg bg-white/5 p-3">
								<strong>{t.label}</strong>{t.why ? ` — ${t.why}` : ''}
							</li>
						{/each}
						{#if !themes.length}
							<li class="rounded-lg bg-white/5 p-3 opacity-60">Tap “Summarise” to populate.</li>
						{/if}
					</ul>
				</div>
				<div>
					<div class="mb-2 text-sm opacity-70">Tensions</div>
					<ul class="space-y-2 text-sm leading-relaxed">
						{#each contradictions as c}
							<li class="rounded-lg bg-white/5 p-3">#{c.a} ↔ #{c.b}: {c.explain}</li>
						{/each}
						{#if !contradictions.length}
							<li class="rounded-lg bg-white/5 p-3 opacity-60">Shown after summary.</li>
						{/if}
					</ul>
				</div>
			</div>

			<div class="mt-4 border-t border-white/10 pt-4">
				<div class="mb-2 text-sm opacity-70">Agenda</div>
				<ol class="space-y-2 text-sm leading-relaxed">
					{#each agenda ?? [] as a, i}
						<li class="rounded-lg bg-white/5 p-3">
							<span class="opacity-70">{i + 1}.</span> <strong>{a.title}</strong> — {a.rationale}
						</li>
					{/each}
					{#if !(agenda && agenda.length)}
						<li class="rounded-lg bg-white/5 p-3 opacity-60">Will appear after summary.</li>
					{/if}
				</ol>
			</div>

			<p class="mt-4 text-xs opacity-60">
				Tip: Have <code>/visualiser</code> open on the big screen — it will update the moment you hit
				“Summarise”.
			</p>
		</div>
	</div>
</div>
