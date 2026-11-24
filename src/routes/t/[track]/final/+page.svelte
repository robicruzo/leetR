<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Mcq from '#lib/components/Mcq.svelte';
	import TrackNav from '#lib/components/TrackNav.svelte';
	import { progressFor } from '#lib/progress.svelte.ts';
	import { challengeKey } from '#lib/tracks.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const track = $derived(data.track);
	const progress = $derived(progressFor(track));
	onMount(() => progress.load());

	const total = $derived(progress.skills.size);
	const at4 = $derived(progress.atLeast(4));
	const ig = $derived(track.final.integrative);
	const igStatus = $derived(progress.state.status[challengeKey(track, null, ig)]);

	function answered(skill: string, firstTry: boolean) {
		// A final question right on the first try lifts an independent skill to 5.
		if (firstTry && progress.level(skill) >= 4) progress.raise(skill, 5);
	}
</script>

<svelte:head><title>Final assessment · Track {track.number} · leetR</title></svelte:head>

<div class="page">
	<TrackNav {track} {progress} here="Final assessment" />
	<h1>Final assessment</h1>
	<p class="lede">One question per module, and one problem that needs most of the track at once.</p>

	{#if progress.loaded && at4 < total}
		<section class="card">
			<p>
				<b>{at4} of {total} skills are at level 4.</b> The track is complete when all of them are. The assessment is open
				now so you can see it, but it is meant for the end.
			</p>
		</section>
	{/if}

	{#each track.final.questions as q (q.id)}
		<section class="card"><Mcq {q} onanswer={(first) => answered(q.skill, first)} /></section>
	{/each}

	<section class="card">
		<h2>Integrative problem</h2>
		<p>{ig.prompt}</p>
		{#if igStatus}<p class="small">{igStatus === 'clean' ? 'Solved cleanly.' : igStatus === 'hinted' ? 'Solved with help.' : 'Solution seen.'}</p>{/if}
		<a
			class="btn primary"
			href={resolve('/t/[track]/m/[module]/c/[challenge]', { track: track.id, module: 'final', challenge: ig.id })}
			>Solve it in the editor →</a
		>
	</section>
</div>

<style>
	.page {
		max-width: 880px;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
	}
	h1 {
		margin: 0 0 0.5rem;
		font-size: 2rem;
	}
</style>
