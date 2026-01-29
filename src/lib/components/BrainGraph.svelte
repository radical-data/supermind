<script lang="ts">
import { createEventDispatcher, onDestroy, onMount } from "svelte";
import { browser } from "$app/environment";
import type { GraphData, GraphLink, GraphNode } from "$lib/types";

// Props (must be `export let` so Svelte/TS treat them as props)
export let background = false; // if true: sits behind UI, no pointer events + auto-orbit
export let interactive = true; // enable hover/drag/nav
export let height = 560; // used when not background
export let labelMode: "hover" | "always" | "zoom" = "hover";

const dispatch = createEventDispatcher();
let el: HTMLDivElement;
type CameraLike = { position: { x: number; y: number; z: number } };
type PostProcessingComposerLike = { addPass: (p: unknown) => void };

type ForceGraph3DInstance = {
	graphData: (data: GraphData) => ForceGraph3DInstance;
	zoomToFit?: (ms?: number, padding?: number) => void;
	camera: () => CameraLike;
	cameraPosition: (pos: Partial<{ x: number; y: number; z: number }>) => void;
	backgroundColor: (c: string) => ForceGraph3DInstance;
	showNavInfo: (b: boolean) => ForceGraph3DInstance;
	nodeId: (k: string) => ForceGraph3DInstance;
	nodeLabel: (
		fn: ((n: GraphNode) => string | null) | null,
	) => ForceGraph3DInstance;
	nodeAutoColorBy: (k: string) => ForceGraph3DInstance;
	nodeOpacity: (v: number) => ForceGraph3DInstance;
	linkWidth: (fn: (l: GraphLink) => number) => ForceGraph3DInstance;
	linkOpacity: (v: number) => ForceGraph3DInstance;
	linkCurvature: (v: number) => ForceGraph3DInstance;
	linkDirectionalParticles: (v: number) => ForceGraph3DInstance;
	enableNodeDrag: (b: boolean) => ForceGraph3DInstance;
	enableNavigationControls: (b: boolean) => ForceGraph3DInstance;
	enablePointerInteraction: (b: boolean) => ForceGraph3DInstance;
	nodeThreeObject: (
		fn: ((n: GraphNode) => unknown) | null | undefined,
	) => ForceGraph3DInstance;
	postProcessingComposer: () => PostProcessingComposerLike;
};

type ForceGraph3DFactory = (
	opts?: unknown,
) => (el: HTMLElement) => ForceGraph3DInstance;

let fg: ForceGraph3DInstance | null = null;
let es: EventSource | null = null;
let firstGraph = true;
let orbitTimer: number | null = null;

// for text labels
type SpriteTextInstance = { textHeight: number; color: string };
type SpriteTextCtor = new (text: string) => SpriteTextInstance;
let SpriteText: SpriteTextCtor | null = null;
let currentLabelMode: "hover" | "always" | "zoom" = labelMode;

function applyLabelMode() {
	if (!fg) return;

	if (currentLabelMode === "hover") {
		// default spheres with tooltip labels
		fg.nodeLabel((n: GraphNode) => n.text || n.label || null).nodeThreeObject(
			undefined,
		);
		fg.nodeOpacity(0.95);
		return;
	}

	// render text sprites as nodes (no tooltip)
	fg.nodeLabel(null);
	fg.nodeThreeObject((n: GraphNode) => {
		if (!SpriteText) return null;
		const sprite = new SpriteText(n.text || n.label || "");
		sprite.textHeight = 6; // tweak for readability
		sprite.color = "#E5E7EB"; // Tailwind zinc-200-ish
		// optional subtle glow via material props could be added here
		return sprite;
	});
	// a touch less opacity so links read under text
	fg.nodeOpacity(0.9);
}

onMount(async () => {
	if (!browser) return;

	const ForceGraph3D = (await import("3d-force-graph"))
		.default as unknown as ForceGraph3DFactory;
	({ default: SpriteText } = (await import("three-spritetext")) as unknown as {
		default: SpriteTextCtor;
	});

	fg = ForceGraph3D({ controlType: "orbit" })(el)
		.backgroundColor("#000003")
		.showNavInfo(false)
		.nodeId("id")
		.nodeLabel((n: GraphNode) => n.label ?? null) // used for labelMode="hover"
		.nodeAutoColorBy("group")
		.nodeOpacity(0.95)
		.linkWidth((l: GraphLink) => (l.value ?? 0.7) * 1.2)
		.linkOpacity(0.6) // a bit stronger so edges are visible
		.linkCurvature(0.25)
		.linkDirectionalParticles(0) // cleaner lines when text labels are on
		.enableNodeDrag(false)
		.enableNavigationControls(interactive);

	applyLabelMode();

	// Optional: auto-switch to labels when zoomed in
	if (labelMode === "zoom") {
		const cam = fg.camera();
		const check = () => {
			// crude distance heuristic; adjust to taste
			const dist = Math.hypot(cam.position.x, cam.position.y, cam.position.z);
			const next: "hover" | "always" = dist < 120 ? "always" : "hover";
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
			if (!fg) return;
			fg.cameraPosition({
				x: dist * Math.sin(angle),
				z: dist * Math.cos(angle),
			});
		}, 16);
		// fully passive when used as background
		fg.enablePointerInteraction(false);
	}

	// Optional bloom (nice glow)
	try {
		const { UnrealBloomPass } = await import(
			"three/examples/jsm/postprocessing/UnrealBloomPass.js"
		);
		const { Vector2 } = await import("three");
		const w = el?.clientWidth ?? 1024;
		const h = el?.clientHeight ?? 1024;
		const bloom = new UnrealBloomPass(new Vector2(w, h), 1.2, 0.6, 0.0);
		fg.postProcessingComposer().addPass(bloom);
	} catch {
		/* no-op if it fails */
	}

	// SSE wiring
	es = new EventSource("/api/stream");
	es.addEventListener("graph", (e: MessageEvent) => {
		fg?.graphData(JSON.parse(e.data) as GraphData);
		if (firstGraph) {
			firstGraph = false;
			fg?.zoomToFit?.(600, 30);
		}
	});
	es.addEventListener("submission_count", (e: MessageEvent) => {
		dispatch("count", JSON.parse(e.data));
	});
	// NEW: bubble up participant count (used by /control)
	es.addEventListener("participant_count", (e: MessageEvent) => {
		dispatch("participants", JSON.parse(e.data));
	});
	es.addEventListener("summary", (e: MessageEvent) => {
		dispatch("summary", JSON.parse(e.data));
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
