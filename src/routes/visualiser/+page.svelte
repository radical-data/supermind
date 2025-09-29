<script lang="ts">
	import BrainGraph from '$lib/components/BrainGraph.svelte';
	let submissionCount = 0;
	let themes: any[] = [];
	let contradictions: any[] = [];

	function onSummary(e: CustomEvent) {
		const s = e.detail;
		themes = s.themes ?? [];
		contradictions = s.contradictions ?? [];
	}
</script>

<!-- Full-bleed stage -->
<div class="relative min-h-screen bg-black text-white">
	<BrainGraph
		interactive
		height={920}
		on:count={(e) => (submissionCount = e.detail.count)}
		on:summary={onSummary}
	/>

	<!-- HUD / overlay -->
	<div class="pointer-events-none absolute inset-0 flex">
		<div class="m-6 mt-auto flex w-full justify-between gap-6">
			<!-- Left: Title + count -->
			<div class="pointer-events-auto rounded-2xl bg-white/5 px-6 py-5 shadow-xl backdrop-blur">
				<div class="text-sm opacity-70">Submissions</div>
				<div class="text-6xl leading-none font-extrabold">{submissionCount}</div>
				<div class="mt-1 text-xs opacity-60">live</div>
			</div>

			<div class="pointer-events-auto grid w-[36rem] grid-rows-2 gap-4">
				<div class="rounded-2xl bg-white/6 px-5 py-4 shadow-xl backdrop-blur">
					<h2 class="mb-2 text-lg font-semibold">Themes</h2>
					<ul class="space-y-1 text-sm leading-relaxed">
						{#each themes as t}
							<li><strong>{t.label}</strong>{t.why ? ` — ${t.why}` : ''}</li>
						{/each}
						{#if !themes.length}<li class="opacity-60">
								Tap “Summarise” on /control to populate.
							</li>{/if}
					</ul>
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
