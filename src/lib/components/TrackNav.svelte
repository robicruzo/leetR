<!-- Breadcrumbs for track pages, with the number of reviews due. -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { TrackProgress } from '#lib/progress.svelte.ts';
	import type { Track } from '#lib/tracks.ts';

	let { track, progress, here = '' }: { track: Track; progress: TrackProgress; here?: string } = $props();
	const due = $derived(progress.loaded ? progress.due().length : 0);
</script>

<nav class="crumbs" aria-label="Track">
	<a href={resolve('/')}>All tracks</a>
	<span aria-hidden="true">/</span>
	<a href={resolve('/t/[track]', { track: track.id })}>Track {track.number}</a>
	{#if here}<span aria-hidden="true">/</span><span>{here}</span>{/if}
	<span class="spacer"></span>
	<a href={resolve('/t/[track]/review', { track: track.id })}>Review{due ? ` (${due} due)` : ''}</a>
</nav>

<style>
	.crumbs {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
		margin: 0 0 1.25rem;
		font-size: 0.92rem;
		color: var(--muted);
	}
	.crumbs a {
		text-decoration: none;
		font-weight: 600;
	}
	.spacer {
		margin-left: auto;
	}
</style>
