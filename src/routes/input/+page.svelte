<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import BrainGraph from '$lib/components/BrainGraph.svelte';

	let name = '';
	let text = '';
	let justSent = false;
	let pid: number | null = null;
	let myMatch: { partnerLabel: string; score: number } | null = null;

	type Bubble = { id: string; text: string; x: number; y: number; life: number };

	let es: EventSource | null = null;
	let bubbles: Bubble[] = [];

	function addBubble(line: { submissionId: number; participantId: number; text: string }) {
		if (pid && line.participantId === pid) return;
		const b: Bubble = {
			id: `${line.submissionId}-${Math.random().toString(36).slice(2)}`,
			text: line.text.slice(0, 120),
			x: 10 + Math.random() * 80,
			y: 15 + Math.random() * 60,
			life: 3800 + Math.random().toFixed(3) * 1200
		};
		bubbles = [...bubbles, b];
		setTimeout(() => (bubbles = bubbles.filter((bb) => bb.id !== b.id)), b.life);
	}

	function resetLocalIdentity() {
		sessionStorage.removeItem('pid');
		// keep the typed name for convenience
		pid = null;
	}

	onMount(() => {
		if (!browser) return;
		const raw = sessionStorage.getItem('pid');
		pid = raw ? Number(raw) : null;
		if (!pid) {
			const savedName = sessionStorage.getItem('name');
			if (savedName) name = savedName;
		}

		es = new EventSource('/api/stream');
		es.addEventListener('line', (e: MessageEvent) => addBubble(JSON.parse(e.data)));
		es.addEventListener('recent_lines', (e: MessageEvent) => {
			const arr = JSON.parse(e.data);
			for (const l of arr) addBubble(l);
		});
		es.addEventListener('matches', (e: MessageEvent) => {
			if (!pid) return;
			// members/names shape: supports pairs or trios
			const data = JSON.parse(e.data) as {
				pairs: { members: number[]; score: number; names: string[] }[];
			};
			const mine = data.pairs.find((g) => g.members.includes(pid!));
			if (!mine) return;
			const others = mine.names.filter((_, i) => mine.members[i] !== pid);
			myMatch = { partnerLabel: others.join(' & '), score: mine.score };
			setTimeout(() => (myMatch = null), 15000);
		});
	});
	onDestroy(() => es?.close());

	async function saveName() {
		if (!name.trim()) return;
		const r = await fetch('/api/join', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: name.trim() })
		});
		if (!r.ok) {
			alert('Could not save name. Please try again.');
			return;
		}
		const { participantId } = await r.json();
		pid = participantId;
		sessionStorage.setItem('pid', String(participantId));
		sessionStorage.setItem('name', name.trim());
	}

	async function submit() {
		if (!pid || !text.trim()) return;
		const r = await fetch('/api/submit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ participantId: pid, kind: 'line', payload: { text } })
		});
		if (!r.ok) {
			const msg = await r.text();
			// If server-side guard fired, reset pid and ask for name again
			if (r.status === 400 && msg.includes('unknown_participant')) {
				resetLocalIdentity();
				alert('Room was reset or your session expired — please enter your name again.');
				return;
			}
			alert('Failed to submit. Please try again.');
			return;
		}
		text = '';
		justSent = true;
		setTimeout(() => (justSent = false), 1200);
	}
</script>

<!-- Background 3D graph -->
<BrainGraph background interactive={false} labelMode="always" />

{#if myMatch}
	<div
		class="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-xl bg-sky-700 px-4 py-2 text-sky-50 shadow-2xl ring-1 ring-sky-300/40"
		role="status"
		aria-live="polite"
	>
		<span class="inline-flex items-center gap-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="currentColor"
				viewBox="0 0 20 20"
				class="h-5 w-5"
			>
				<path
					d="M10 3a3 3 0 100 6 3 3 0 000-6zM2 16a6 6 0 1112 0H2zM14.5 6a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM14.5 12c-1.206 0-2.366.184-3.448.523A6.977 6.977 0 0114.5 18h5v-1a5 5 0 00-5-5z"
				/>
			</svg>
			<span class="font-semibold">Suggested conversation partner:</span>
			<span class="font-medium">{myMatch.partnerLabel}</span>
			<span class="opacity-80">(~{Math.round(myMatch.score * 100)}% similar)</span>
		</span>
	</div>
{/if}

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

<div class="relative mx-auto max-w-xl space-y-4 p-6">
	<!-- Heading changes based on state -->
	{#if !pid}
		<h1 class="text-xl font-semibold text-white drop-shadow">Welcome — what’s your name?</h1>
	{:else}
		<h1 class="text-xl font-semibold text-white drop-shadow">One line: how could AI improve our work in logistics and beyond?</h1>
	{/if}

	{#if !pid}
		<!-- Name card (distinct look) -->
		<form
			class="space-y-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10"
			on:submit|preventDefault={saveName}
		>
			<label class="block text-sm text-white/90">Your name</label>
			<input placeholder="e.g. Amira" class="mt-1 w-full" bind:value={name} autocomplete="off" />
			<button
				type="submit"
				class="inline-block rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
				disabled={!name.trim()}
			>
				Enter
			</button>
			<p class="text-sm text-gray-300">
				You can already watch ideas appear live above while you get set up.
			</p>
			<p class="text-xs text-white/60">
				Not you? <button type="button" class="underline" on:click={resetLocalIdentity}>reset</button
				>
			</p>
		</form>
	{:else}
		<!-- Line submission -->
		<form class="space-y-3" on:submit|preventDefault={submit}>
			<input
				placeholder="AI helps us predict delays earlier"
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
			<p class="text-sm text-gray-300">You can keep adding more lines.</p>
		</form>
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

	.fixed.bottom-6 {
		animation: toastIn 180ms ease-out;
	}
	@keyframes toastIn {
		from {
			transform: translate(-50%, 8px);
			opacity: 0;
		}
		to {
			transform: translate(-50%, 0);
			opacity: 1;
		}
	}
</style>
