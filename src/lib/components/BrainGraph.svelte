<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';

	// Props
	export let background = false; // if true: sits behind UI, no pointer events + auto-orbit
	export let interactive = true; // enable hover/drag/nav
	export let height = 560; // used when not background
	// NEW: label rendering mode
	export let labelMode: 'hover' | 'always' | 'zoom' = 'hover';

	const dispatch = createEventDispatcher();
	let el: HTMLDivElement;
	let fg: any;
	let es: EventSource | null = null;
	let firstGraph = true;
	let orbitTimer: number | null = null;

	// for text labels
	let SpriteText: any;
	let currentLabelMode: 'hover' | 'always' | 'zoom' = labelMode;

	function applyLabelMode() {
		if (!fg) return;

		if (currentLabelMode === 'hover') {
			// default spheres with tooltip labels
			fg.nodeLabel((n: any) => n.text || n.label).nodeThreeObject(undefined);
			fg.nodeOpacity(0.95);
			return;
		}

		// render text sprites as nodes (no tooltip)
		fg.nodeLabel(null);
		fg.nodeThreeObject((n: any) => {
			const sprite = new SpriteText(n.text || n.label || '');
			sprite.textHeight = 6; // tweak for readability
			sprite.color = '#E5E7EB'; // Tailwind zinc-200-ish
			// optional subtle glow via material props could be added here
			return sprite;
		});
		// a touch less opacity so links read under text
		fg.nodeOpacity(0.9);
	}

	onMount(async () => {
		if (!browser) return;

		const ForceGraph3D: any = (await import('3d-force-graph')).default;
		({ default: SpriteText } = await import('three-spritetext'));

		fg = new ForceGraph3D(el, { controlType: 'orbit' })
			.backgroundColor('#000003')
			.showNavInfo(false)
			.nodeId('id')
			.nodeLabel((n: any) => n.label) // used for labelMode="hover"
			.nodeAutoColorBy('group')
			.nodeOpacity(0.95)
			.linkWidth((l: any) => (l.value ?? 0.7) * 1.2)
			.linkOpacity(0.6) // a bit stronger so edges are visible
			.linkCurvature(0.25)
			.linkDirectionalParticles(0) // cleaner lines when text labels are on
			.enableNodeDrag(false)
			.enableNavigationControls(interactive);

		applyLabelMode();

		// Optional: auto-switch to labels when zoomed in
		if (labelMode === 'zoom') {
			const cam = fg.camera();
			const check = () => {
				// crude distance heuristic; adjust to taste
				const dist = Math.hypot(cam.position.x, cam.position.y, cam.position.z);
				const next: 'hover' | 'always' = dist < 120 ? 'always' : 'hover';
				if (next !== currentLabelMode) {
					currentLabelMode = next;
					applyLabelMode();
				}
				requestAnimationFrame(check);
			};
			requestAnimationFrame(check);
		}

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

		// SSE wiring
		es = new EventSource('/api/stream');
		es.addEventListener('graph', (e: MessageEvent) => {
			fg.graphData(JSON.parse(e.data));
			if (firstGraph) {
				firstGraph = false;
				fg.zoomToFit?.(600, 30);
			}
		});
		es.addEventListener('submission_count', (e: MessageEvent) => {
			dispatch('count', JSON.parse(e.data));
		});
		// NEW: bubble up participant count (used by /control)
		es.addEventListener('participant_count', (e: MessageEvent) => {
			dispatch('participants', JSON.parse(e.data));
		});
		es.addEventListener('summary', (e: MessageEvent) => {
			dispatch('summary', JSON.parse(e.data));
		});
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
