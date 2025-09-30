<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import QRCode from 'qrcode';

	let canvas: HTMLCanvasElement;
	let joinUrl = '';

	onMount(async () => {
		if (!browser) return;

		joinUrl = location.origin + '/input';
		await QRCode.toCanvas(canvas, joinUrl, { margin: 1, width: 480 });
	});
</script>

<div class="min-h-screen bg-black p-6 text-white">
	<h1 class="mb-6 text-2xl font-semibold">Scan to participate</h1>
	<div class="grid gap-8 md:grid-cols-2">
		<div class="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
			<canvas bind:this={canvas}></canvas>
			{#if joinUrl}
				<div class="mt-3 text-sm break-all opacity-70">{joinUrl}</div>
			{/if}
		</div>
	</div>
	<p class="mt-6 text-sm opacity-60">Tip: ⌘+P / Ctrl+P to print this page before the session.</p>
</div>
