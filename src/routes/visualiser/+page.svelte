<script lang="ts">
	import BrainGraph from '$lib/components/BrainGraph.svelte';

	let submissionCount = 0;
	let themes: any[] = [];
	let contradictions: any[] = [];
	let agenda: any[] = [];
	let tone: any = null;

	function onSummary(e: CustomEvent) {
		const s = e.detail;
		themes = s.themes ?? [];
		contradictions = s.contradictions ?? [];
		agenda = s.agenda ?? [];
		tone = s.tone ?? null;
	}
</script>

<div class="relative min-h-screen bg-black text-white">
	<BrainGraph
		interactive
		labelMode="always"
		height={920}
		on:count={(e) => (submissionCount = e.detail.count)}
		on:summary={onSummary}
	/>

	<!-- HUD / overlay -->
	<div class="pointer-events-none absolute inset-0 flex">
		<div class="m-6 mt-auto grid w-full grid-cols-1 gap-4 lg:grid-cols-3">
			<!-- Submissions -->
			<div class="pointer-events-auto rounded-2xl bg-white/5 px-6 py-5 shadow-xl backdrop-blur">
				<div class="text-sm opacity-70">Submissions</div>
				<div class="text-6xl leading-none font-extrabold">{submissionCount}</div>
				<div class="mt-1 text-xs opacity-60">live{tone ? ` • mood: ${tone.mood}` : ''}</div>
			</div>

			<!-- Themes (with one quote if present) -->
			<div class="pointer-events-auto rounded-2xl bg-white/6 px-5 py-4 shadow-xl backdrop-blur">
				<h2 class="mb-2 text-lg font-semibold">Themes</h2>
				<ul class="space-y-2 text-sm leading-relaxed">
					{#each themes as t}
						<li class="rounded-lg bg-white/5 p-2">
							<strong>{t.label}</strong>{t.why ? ` — ${t.why}` : ''}
							{#if t.examples && t.examples.length}
								<div class="mt-1 text-xs opacity-80">
									“{t.examples[0].text}” — #{t.examples[0].participantId}
								</div>
							{/if}
						</li>
					{/each}
					{#if !themes.length}<li class="opacity-60">
							Tap “Summarise” on /control to populate.
						</li>{/if}
				</ul>
			</div>

			<!-- Agenda (top 3) + Tensions -->
			<div class="pointer-events-auto grid grid-rows-2 gap-4">
				<div class="rounded-2xl bg-white/6 px-5 py-4 shadow-xl backdrop-blur">
					<h2 class="mb-2 text-lg font-semibold">Agenda</h2>
					<ol class="space-y-2 text-sm leading-relaxed">
						{#each (agenda ?? []).slice(0, 3) as a, i}
							<li class="rounded-lg bg-white/5 p-2">
								<span class="opacity-70">{i + 1}.</span> <strong>{a.title}</strong> — {a.rationale}
							</li>
						{/each}
						{#if !(agenda && agenda.length)}<li class="opacity-60">Shown after summary.</li>{/if}
					</ol>
				</div>
				<div class="rounded-2xl bg-white/6 px-5 py-4 shadow-xl backdrop-blur">
					<h2 class="mb-2 text-lg font-semibold">Tensions</h2>
					<ul class="space-y-1 text-sm leading-relaxed">
						{#each contradictions as c}
							<li>#{c.a} ↔ #{c.b}: {c.explain}</li>
						{/each}
						{#if !contradictions.length}<li class="opacity-60">Shown after summary.</li>{/if}
					</ul>
				</div>
			</div>
		</div>
	</div>
</div>
