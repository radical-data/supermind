<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	let name = '',
		org = '',
		tableSide: 'A' | 'B' = 'A';
	$: {
		const t = new URLSearchParams($page.url.search).get('table');
		if (t === 'A' || t === 'B') tableSide = t;
	}
	async function submit() {
		const r = await fetch('/api/join', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, org, tableSide })
		});
		const { participantId } = await r.json();
		sessionStorage.setItem('pid', String(participantId));
		sessionStorage.setItem('table', tableSide);
		goto('/input');
	}
</script>

<div class="mx-auto max-w-md space-y-4 p-6">
	<h1 class="text-2xl font-semibold">Join</h1>
	<label class="block">Name <input class="mt-1 w-full" bind:value={name} /></label>
	<label class="block"
		>Table
		<select class="mt-1 w-full" bind:value={tableSide}>
			<option value="A">A (left)</option>
			<option value="B">B (right)</option>
		</select>
	</label>
	<button
		class="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
		on:click|preventDefault={submit}
		disabled={!name}>Enter</button
	>
</div>
