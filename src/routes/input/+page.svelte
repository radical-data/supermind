<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import BrainGraph from '$lib/components/BrainGraph.svelte';

	let text = '';
	let justSent = false;
	let pid: number | null = null;

	onMount(() => {
		if (!browser) return;
		const raw = sessionStorage.getItem('pid');
		pid = raw ? Number(raw) : null;
	});

	onDestroy(() => {
		/* nothing else to clean */
	});

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
		<p><a class="text-gray-300 underline" href="/visualiser">See the live brain</a></p>
	{/if}
</div>
