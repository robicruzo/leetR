<!-- The columns of a challenge's dataset, so nobody has to look them up. -->
<script lang="ts">
	import type { DatasetInfo } from '#lib/tracks.ts';

	let { name, info }: { name: string; info: DatasetInfo | undefined } = $props();

	const LIMIT = 12;
	let all = $state(false);
	const shown = $derived(info && !all ? info.cols.slice(0, LIMIT) : (info?.cols ?? []));
	const fmt = (n: number) => n.toLocaleString('en-US');
</script>

{#if info}
	<div class="data">
		<p class="head">
			<code>{name}</code>
			<span class="dims">{fmt(info.rows)} rows × {info.ncol} columns</span>
		</p>
		<ul>
			{#each shown as c (c.name)}
				<li><span class="name">{c.name}</span> <span class="type">&lt;{c.type}&gt;</span></li>
			{/each}
		</ul>
		{#if info.cols.length > LIMIT}
			<button class="more" onclick={() => (all = !all)}>
				{all ? 'Show fewer' : `Show all ${info.cols.length} columns`}
			</button>
		{/if}
	</div>
{/if}

<style>
	.data {
		margin: 0.75rem 0;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--active-line);
	}
	.head {
		margin: 0 0 0.4rem;
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.dims {
		font-size: 0.82rem;
		color: var(--muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.9rem;
		font: 0.8rem var(--mono);
	}
	.type {
		color: var(--muted);
	}
	.more {
		margin-top: 0.4rem;
		padding: 0.1rem 0.5rem;
		font-size: 0.78rem;
	}
</style>
