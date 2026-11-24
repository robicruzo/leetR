<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import Mcq from '#lib/components/Mcq.svelte';
	import TrackNav from '#lib/components/TrackNav.svelte';
	import { progressFor } from '#lib/progress.svelte.ts';
	import { getModule } from '#lib/tracks.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const track = $derived(data.track);
	const progress = $derived(progressFor(track));
	onMount(() => progress.load());

	// Nothing is explained until the end, so the result shows where to start.
	let answers = $state<Record<string, boolean>>({});
	let result: HTMLElement | undefined = $state();
	const finished = $derived(Object.keys(answers).length === track.diagnostic.length);
	const right = $derived(track.diagnostic.filter((q) => answers[q.id]).length);
	const firstMiss = $derived(track.diagnostic.find((q) => !answers[q.id]));
	const start = $derived(firstMiss ? getModule(track, firstMiss.module) : track.modules[0]);

	async function answer(id: string, ok: boolean) {
		answers[id] = ok;
		if (Object.keys(answers).length < track.diagnostic.length) return;
		for (const q of track.diagnostic) if (answers[q.id]) progress.raise(q.skill, 1);
		progress.setPlacement(start!.id);
		await tick();
		result?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<svelte:head><title>Placement · Track {track.number} · leetR</title></svelte:head>

<div class="page">
	<TrackNav {track} {progress} here="Placement" />
	<h1>Placement questions</h1>
	<p class="lede">
		{track.diagnostic.length} quick questions, one per area. Answer what you can. Nothing is explained until the end, so
		the result shows where to start.
	</p>

	{#each track.diagnostic as q (q.id)}
		<section class="card">
			<Mcq {q} once onanswer={(ok) => answer(q.id, ok)} />
		</section>
	{/each}

	{#if finished && start}
		<section class="card" bind:this={result}>
			<h2>{right} of {track.diagnostic.length} right</h2>
			<p>
				{#if firstMiss}
					Start with <b>{start.title}</b>. Each module still opens with its own prediction, so modules you already know
					go quickly.
				{:else}
					All of them right. Start at the beginning anyway: the challenges go well past these questions.
				{/if}
			</p>
			<a class="btn primary" href={resolve('/t/[track]/m/[module]', { track: track.id, module: start.id })}>
				Go to that module
			</a>
		</section>
	{/if}
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
