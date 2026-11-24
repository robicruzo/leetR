<!-- Levels 0–5 for a list of subskills, as a text bar. -->
<script lang="ts">
	import type { TrackProgress } from '#lib/progress.svelte.ts';

	let { progress, ids }: { progress: TrackProgress; ids: string[] } = $props();
	const bar = (v: number) => '█'.repeat(v) + '░'.repeat(5 - v);
</script>

<div class="map">
	{#each ids as k (k)}
		{@const name = progress.skills.get(k)?.name ?? k}
		{@const v = progress.level(k)}
		<div class="row">
			<span title={name}>{name}</span>
			<span class="bar" aria-hidden="true">{bar(v)}</span>
			<span>{v}/5</span>
		</div>
	{/each}
</div>

<style>
	.map {
		font: 0.85rem/1.9 var(--mono);
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 0.75rem;
	}
	.row span:first-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: system-ui, sans-serif;
	}
	.bar {
		letter-spacing: 1px;
		white-space: nowrap;
	}
</style>
