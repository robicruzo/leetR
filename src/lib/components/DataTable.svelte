<!-- A small R table (formatted values) as HTML. -->
<script lang="ts">
	import type { DataTable } from '#lib/tracks.ts';
	let { table }: { table: DataTable } = $props();
</script>

<div class="scroll">
	<table>
		<thead><tr>{#each table.cols as c (c)}<th>{c}</th>{/each}</tr></thead>
		<tbody>
			{#each table.rows as row, i (i)}
				<tr>{#each row as v, j (j)}<td class:na={v === 'NA'}>{v}</td>{/each}</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.scroll {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		font: 0.82rem var(--mono);
		margin: 0 0 0.75rem;
	}
	th,
	td {
		padding: 0.2rem 0.65rem;
		text-align: left;
		border-bottom: 1px solid var(--border);
	}
	th {
		color: var(--muted);
		font-weight: 600;
	}
	td.na {
		color: var(--fail);
		font-style: italic;
	}
</style>
