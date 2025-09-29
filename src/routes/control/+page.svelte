<script>
	async function summarise() {
		await fetch('/api/summary', { method: 'POST' });
	}
</script>

<div class="space-x-2 p-6">
	<a class="inline-block rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800" href="/join"
		>Join page</a
	>
	<a class="inline-block rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800" href="/input"
		>Input page</a
	>
	<a
		class="inline-block rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800"
		href="/visualiser">Visualiser</a
	>
	<button
		class="inline-block rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800"
		on:click={summarise}>Summarise</button
	>
</div>
