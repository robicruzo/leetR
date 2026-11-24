<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import SkillMap from '#lib/components/SkillMap.svelte';
	import TrackNav from '#lib/components/TrackNav.svelte';
	import { progressFor } from '#lib/progress.svelte.ts';
	import { getModule, shortTitle } from '#lib/tracks.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const track = $derived(data.track);
	const progress = $derived(progressFor(track));
	onMount(() => progress.load());

	const total = $derived(progress.skills.size);
	const at4 = $derived(progress.atLeast(4));
	const due = $derived(progress.loaded ? progress.due().length : 0);
	const placement = $derived(progress.state.placement ? getModule(track, progress.state.placement) : null);
	const c = $derived(track.built.counts);
</script>

<svelte:head><title>Track {track.number}: {track.title} · leetR</title></svelte:head>

<div class="page">
	<TrackNav {track} {progress} />
	<h1>Track {track.number}: {track.title}</h1>
	<p class="lede">{track.summary}</p>

	<div class="row">
		<a class="btn primary" href={resolve('/t/[track]/placement', { track: track.id })}>
			{progress.state.placement ? 'Retake the placement questions' : `Start with ${track.diagnostic.length} placement questions`}
		</a>
		<a class="btn" href={resolve('/t/[track]/review', { track: track.id })}>Review{due ? `: ${due} due` : ''}</a>
		<a class="btn" href={resolve('/t/[track]/final', { track: track.id })}>
			Final assessment ({at4} of {total} skills at level 4)
		</a>
	</div>
	{#if placement}
		<p class="small">
			Placement suggested starting at
			<a href={resolve('/t/[track]/m/[module]', { track: track.id, module: placement.id })}>{placement.title}</a>.
		</p>
	{/if}

	<h2>Modules</h2>
	<div class="modlist">
		{#each track.modules as m, i (m.id)}
			{@const pct = progress.modulePercent(m.id)}
			<a class="mod" href={resolve('/t/[track]/m/[module]', { track: track.id, module: m.id })}>
				<b>{i + 1}. {shortTitle(m)}</b>
				<span class="small">{m.subskills.length} skills · {m.challenges.length} challenges</span>
				<div class="meter" aria-label="{pct}% of levels earned"><i style:width="{pct}%"></i></div>
			</a>
		{/each}
	</div>

	<section class="card">
		<h2>Skill map</h2>
		{#each track.modules as m (m.id)}
			<details>
				<summary>{shortTitle(m)} · {progress.modulePercent(m.id)}%</summary>
				<SkillMap {progress} ids={m.subskills.map((s) => s.id)} />
			</details>
		{/each}
		<p class="small">
			Levels: 1 heard of it · 2 follows along · 3 does it with help · 4 independent (clean solves on two different
			days, one of them in a review) · 5 a stretch or brain-melter solved cleanly on top of level 4.
		</p>
	</section>

	<p class="small">
		Checked {track.built.at} in {track.built.r} ({track.built.runtime}) with dplyr {track.built.dplyr}: {c.modules}
		modules, {c.challenges} challenges, {c.probes} probe trees and {c.anim_steps} animation steps from {c.lines} lines
		of YAML. Every animation table and expected result is real R output. Progress stays in this browser.
	</p>
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
		letter-spacing: -0.02em;
	}
	h2 {
		font-size: 1.15rem;
	}
	.row {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin: 1rem 0;
	}
	.modlist {
		display: grid;
		gap: 0.6rem;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		margin-bottom: 1.5rem;
	}
	.mod {
		display: block;
		padding: 0.85rem 1rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		text-decoration: none;
		color: var(--text);
		background: var(--panel);
	}
	.mod:hover {
		border-color: var(--accent);
	}
	.mod b {
		display: block;
		margin-bottom: 0.3rem;
	}
	.meter {
		height: 8px;
		border-radius: 4px;
		background: var(--tray);
		overflow: hidden;
		margin-top: 0.5rem;
	}
	.meter i {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	details summary {
		cursor: pointer;
		font-weight: 600;
		padding: 0.3rem 0;
	}
</style>
