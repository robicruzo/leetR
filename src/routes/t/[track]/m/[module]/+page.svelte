<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import DataColumns from '#lib/components/DataColumns.svelte';
	import DataTable from '#lib/components/DataTable.svelte';
	import Mcq from '#lib/components/Mcq.svelte';
	import SkillMap from '#lib/components/SkillMap.svelte';
	import TableMorph from '#lib/components/TableMorph.svelte';
	import TrackNav from '#lib/components/TrackNav.svelte';
	import { progressFor } from '#lib/progress.svelte.ts';
	import { challengeKey, shortTitle, type Mcq as McqT, type Option, type TrackChallenge } from '#lib/tracks.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const track = $derived(data.track);
	const m = $derived(data.mod);
	const progress = $derived(progressFor(track));
	onMount(() => progress.load());

	const idx = $derived(track.modules.indexOf(m));
	const prev = $derived(idx > 0 ? track.modules[idx - 1] : null);
	const next = $derived(idx < track.modules.length - 1 ? track.modules[idx + 1] : null);
	const answer = $derived(m.predict.options.find((o) => o.correct)!.choice);

	// 1 Predict: the animation stays locked until the learner commits.
	let picked = $state<Option | null>(null);
	let watched = $state(false);
	let probe1Done = $state(false);

	// SvelteKit reuses this component when moving between modules: start fresh.
	$effect.pre(() => {
		void m.id;
		picked = null;
		watched = false;
		probe1Done = false;
	});

	const predictNote = $derived.by(() => {
		if (!picked) return null;
		if (watched) {
			return picked.correct
				? { tone: 'ok' as const, lead: `You predicted ${picked.choice}, and that is what R returns.`, text: '' }
				: {
						tone: 'bad' as const,
						lead: `You predicted ${picked.choice}; R returns ${answer}.`,
						text: 'Step back through the animation to find where your picture of it went wrong.'
					};
		}
		return picked.probe
			? { tone: 'plain' as const, lead: 'Locked in.', text: `While you watch, keep this question in mind: ${picked.probe}` }
			: { tone: 'plain' as const, lead: 'Locked in.', text: 'Watch the steps and check it.' };
	});

	function onPredict(_ok: boolean, o: Option) {
		picked = o;
		progress.raise(m.predict.skill, 1);
	}

	// 2 Watch: each step raises its subskill to 1; the last step settles the prediction.
	function onStep(i: number) {
		if (!picked) return;
		progress.raise(m.anim[i].skill, 1);
		if (i === m.anim.length - 1 && !watched) {
			watched = true;
			if (picked.correct) progress.raise(m.predict.skill, 2);
			progress.schedule({ id: `pred:${m.id}`, kind: 'predict', module: m.id, skill: m.predict.skill }, !!picked.correct);
		}
	}

	// 3 Probe
	function onProbe(i: number, firstTry: boolean) {
		const p = m.probes[i];
		progress.raise(p.skill, firstTry ? 2 : 1);
		progress.schedule({ id: `probe:${p.id}`, kind: 'probe', module: m.id, skill: p.skill }, firstTry);
		if (i === 0) probe1Done = true;
	}

	// 4 Do: predict-type challenges are answered here; the rest open the editor.
	const predictQ = (ch: TrackChallenge): McqT => ({
		skill: ch.skill ?? '',
		ask: '',
		code: ch.code,
		explain: ch.explain,
		right_followup: ch.explain,
		options: (ch.options ?? []).map((o) => ({
			choice: o,
			correct: o === ch.answer,
			probe: 'Run it in your head once more, row by row.'
		}))
	});

	const statusLabel = { clean: 'Solved cleanly', hinted: 'Solved with help', seen: 'Solution seen' };
	const rules = (ch: TrackChallenge) =>
		[
			ch.forbid?.length ? `Not allowed: ${ch.forbid.join(' ')}` : '',
			ch.require?.length ? `Must use: ${ch.require.join(' ')}` : ''
		].filter(Boolean);
</script>

<svelte:head><title>{shortTitle(m)} · Track {track.number} · leetR</title></svelte:head>

<div class="page">
	<TrackNav {track} {progress} here="Module {idx + 1}" />
	<h1>{m.title}</h1>
	<p class="lede">{m.key_idea}</p>

	{#key m.id}
	<section class="card">
		<h2>1 · Predict</h2>
		{#if m.predict.data_table}<DataTable table={m.predict.data_table} />{/if}
		<Mcq q={m.predict} once onanswer={onPredict} note={predictNote} />
	</section>

	<TableMorph steps={m.anim} locked={!picked} onstep={onStep} />

	{#if watched}
		<section class="card">
			<h2>3 · Probe</h2>
			<Mcq q={m.probes[0]} onanswer={(first) => onProbe(0, first)} />
			{#if probe1Done && m.probes[1]}
				<div class="gap"><Mcq q={m.probes[1]} onanswer={(first) => onProbe(1, first)} /></div>
			{/if}
		</section>
	{/if}

	<section class="card">
		<h2>4 · Do</h2>
		<p class="small">
			Two warm-ups, three core, two stretch and one brain-melter. R grades each one: your result is compared with the
			reference, then both are run again on a different sample of the data. Opening a hint or the solution is recorded
			honestly.
		</p>
		{#each m.challenges as ch, i (ch.id)}
			{@const key = challengeKey(track, m, ch)}
			{@const st = progress.state.status[key]}
			<div class="ch">
				<div class="meta">
					<span class="tier {ch.tier}">{ch.tier}</span>
					<span class="tier">{ch.type}</span>
					<span class="tier">data: {ch.data}</span>
					{#if st}<span class="status" class:ok-text={st === 'clean'}>{statusLabel[st]}</span>{/if}
				</div>
				<p><b>{i + 1}.</b> {ch.prompt}</p>
				{#each rules(ch) as r (r)}<p class="small">{r}</p>{/each}
				{#if ch.type === 'predict'}
					<DataColumns name={ch.data} info={track.datasets[ch.data]} />
					<Mcq q={predictQ(ch)} onanswer={(first) => progress.predicted(key, ch, first)} />
				{:else}
					<a class="btn" href={resolve('/t/[track]/m/[module]/c/[challenge]', { track: track.id, module: m.id, challenge: ch.id })}>
						{st ? 'Open again' : 'Solve it'} →
					</a>
				{/if}
			</div>
		{/each}
	</section>
	{/key}

	<section class="card">
		<h2>Skill map for this module</h2>
		<SkillMap {progress} ids={m.subskills.map((s) => s.id)} />
	</section>

	<section class="card">
		<h2>Readings</h2>
		{#each m.readings as r (r.label)}
			<p class="reading">{#if r.url}<a href={r.url}>{r.label}</a>{:else}{r.label}{/if}</p>
		{/each}
	</section>

	<div class="pager">
		{#if prev}
			<a class="btn" href={resolve('/t/[track]/m/[module]', { track: track.id, module: prev.id })}>Previous: {shortTitle(prev)}</a>
		{:else}<span></span>{/if}
		{#if next}
			<a class="btn primary" href={resolve('/t/[track]/m/[module]', { track: track.id, module: next.id })}>Next: {shortTitle(next)}</a>
		{:else}
			<a class="btn primary" href={resolve('/t/[track]/final', { track: track.id })}>Final assessment</a>
		{/if}
	</div>
</div>

<style>
	.page {
		max-width: 880px;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
	}
	h1 {
		margin: 0 0 0.5rem;
		font-size: 1.9rem;
		letter-spacing: -0.01em;
	}
	.gap {
		margin-top: 1.25rem;
	}
	.ch {
		border-top: 1px solid var(--border);
		padding: 1rem 0 0.5rem;
	}
	.ch:first-of-type {
		border-top: 0;
	}
	.meta {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		align-items: center;
		margin-bottom: 0.4rem;
	}
	.status {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.ch p {
		margin: 0.3rem 0;
	}
	.reading {
		margin: 0 0 0.35rem;
	}
	.pager {
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
</style>
