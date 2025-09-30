<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import BrainGraph from '$lib/components/BrainGraph.svelte';

	let text = '';
	let justSent = false;
	let pid: number | null = null;

	type Bubble = { id: string; text: string; x: number; y: number; life: number };

	let es: EventSource | null = null;
	let bubbles: Bubble[] = [];

	function addBubble(line: { submissionId: number; participantId: number; text: string }) {
		// Don't show your own message as a bubble on your screen (optional)
		if (pid && line.participantId === pid) return;
		// Random position; life in ms
		const b: Bubble = {
			id: `${line.submissionId}-${Math.random().toString(36).slice(2)}`,
			text: line.text.slice(0, 120),
			x: 10 + Math.random() * 80, // vw
			y: 15 + Math.random() * 60, // vh
			life: 3800 + Math.random() * 1200
		};
		bubbles = [...bubbles, b];
		setTimeout(() => (bubbles = bubbles.filter((bb) => bb.id !== b.id)), b.life);
	}

	onMount(() => {
		if (!browser) return;
		const raw = sessionStorage.getItem('pid');
		pid = raw ? Number(raw) : null;

		es = new EventSource('/api/stream');
		es.addEventListener('line', (e: MessageEvent) => addBubble(JSON.parse(e.data)));
		es.addEventListener('recent_lines', (e: MessageEvent) => {
			const arr = JSON.parse(e.data);
			for (const l of arr) addBubble(l);
		});
	});
	onDestroy(() => es?.close());

	async function submit() {
		if (!pid || !text.trim()) return;
		await fetch('/api/submit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ participantId: pid, kind: 'line', payload: { text } })
		});
		text = '';
		justSent = true;
		setTimeout(() => (justSent = false), 1200);
	}
</script>

<!-- Background 3D graph -->
<BrainGraph background interactive={false} />

<!-- Floating community bubbles -->
<div class="pointer-events-none absolute inset-0 overflow-hidden">
	{#each bubbles as b (b.id)}
		<div
			class="bubble"
			style={`left:${b.x}vw; top:${b.y}vh; animation-duration:${b.life}ms`}
			aria-hidden="true"
		>
			{b.text}
		</div>
	{/each}
</div>

<div class="relative mx-auto max-w-xl space-y-3 p-6">
	<h1 class="text-xl font-semibold text-white drop-shadow">Share one short line</h1>

	{#if pid === null}
		<p class="text-sm text-red-300">
			Please <a class="underline" href="/join">join</a> first.
		</p>
	{:else}
		<!-- Enter submits -->
		<form class="space-y-3" on:submit|preventDefault={submit}>
			<input
				placeholder="e.g. ‘AI helps us spot exceptions earlier’"
				maxlength="140"
				class="w-full"
				bind:value={text}
				autocomplete="off"
			/>
			<div class="flex items-center gap-3">
				<button
					type="submit"
					class="inline-block rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
					disabled={!text.trim()}
				>
					Send
				</button>
				{#if justSent}<span class="text-green-400">Sent ✓</span>{/if}
			</div>
		</form>
		<p class="text-sm text-gray-300">You can keep adding more lines.</p>
	{/if}
</div>

<style>
	.bubble {
		position: absolute;
		max-width: 40ch;
		padding: 0.5rem 0.7rem;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 12px;
		color: #fff;
		font-size: 0.9rem;
		backdrop-filter: blur(4px);
		transform: translateY(0) scale(0.98);
		opacity: 0;
		animation-name: bubbleFloat;
		animation-timing-function: ease-out;
		animation-fill-mode: forwards;
	}
	@keyframes bubbleFloat {
		0% {
			opacity: 0;
			transform: translateY(8px) scale(0.98);
		}
		10% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
		80% {
			opacity: 1;
			transform: translateY(-12px) scale(1);
		}
		100% {
			opacity: 0;
			transform: translateY(-18px) scale(0.98);
		}
	}
</style>
