<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';

	export let background = false; // if true: sits behind UI, no pointer events + auto-orbit
	export let interactive = true; // enable hover/drag/nav
	export let height = 560; // used when not background

	const dispatch = createEventDispatcher();
	let el: HTMLDivElement;
	let fg: any;
	let es: EventSource | null = null;
	let firstGraph = true;
	let orbitTimer: number | null = null;

	onMount(async () => {
		if (!browser) return;
		const ForceGraph3D: any = (await import('3d-force-graph')).default;

		fg = new ForceGraph3D(el, { controlType: 'orbit' })
			.backgroundColor('#000003')
			.showNavInfo(false)
			.nodeId('id')
			.nodeLabel((n: any) => n.label)
			.nodeAutoColorBy('table')
			.nodeOpacity(0.95)
			.linkWidth((l: any) => (l.value ?? 0.7) * 1.2)
			.linkOpacity(0.35)
			.linkCurvature(0.25)
			.linkDirectionalParticles(2)
			.linkDirectionalParticleSpeed(0.0025)
			.enableNodeDrag(false)
			.enableNavigationControls(interactive);

		// Gentle background orbit for ambience
		if (background) {
			const dist = 140;
			let angle = 0;
			fg.cameraPosition({ z: dist });
			orbitTimer = window.setInterval(() => {
				angle += Math.PI / 480;
				fg.cameraPosition({ x: dist * Math.sin(angle), z: dist * Math.cos(angle) });
			}, 16);
			// fully passive when used as background
			fg.enablePointerInteraction(false);
		}

		// Optional bloom (nice glow)
		try {
			const { UnrealBloomPass } = await import(
				'three/examples/jsm/postprocessing/UnrealBloomPass.js'
			);
			const bloom = new UnrealBloomPass();
			bloom.strength = 1.2;
			bloom.radius = 0.6;
			bloom.threshold = 0.0;
			fg.postProcessingComposer().addPass(bloom);
		} catch {
			/* no-op if it fails */
		}

		es = new EventSource('/api/stream');
		es.addEventListener('graph', (e: MessageEvent) => {
			fg.graphData(JSON.parse(e.data));
			if (firstGraph) {
				firstGraph = false;
				fg.zoomToFit?.(600, 30);
			}
		});
		es.addEventListener('submission_count', (e: MessageEvent) =>
			dispatch('count', JSON.parse(e.data))
		);
		es.addEventListener('summary', (e: MessageEvent) => dispatch('summary', JSON.parse(e.data)));
	});

	onDestroy(() => {
		es?.close();
		if (orbitTimer) clearInterval(orbitTimer);
	});
</script>

<div
	bind:this={el}
	class={background ? 'pointer-events-none absolute inset-0 -z-10 opacity-80' : 'w-full'}
	style={!background ? `height:${height}px` : ''}
></div>
