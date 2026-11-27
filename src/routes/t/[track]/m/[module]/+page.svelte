<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import DataColumns from '#lib/components/DataColumns.svelte';
	import DataTable from '#lib/components/DataTable.svelte';
	import Mcq from '#lib/components/Mcq.svelte';
	import SkillMap from '#lib/components/SkillMap.svelte';
	import PlotStack from '#lib/components/PlotStack.svelte';
	import TableMorph from '#lib/components/TableMorph.svelte';
	import TrackNav from '#lib/components/TrackNav.svelte';
	import { progressFor, type AnswerState } from '#lib/progress.svelte.ts';
	import { answerKey, challengeKey, predictQuestion, shortTitle, type Option, type TrackChallenge } from '#lib/tracks.ts';
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

	// Answers are saved per question, so a revisit shows what you chose.
	// Only a question's first answer changes levels and reviews.
	const keyOf = (part: string) => `${track.id}/${m.id}/${part}`;
	const predictKey = $derived(keyOf('predict'));
	const probeKey = (i: number) => keyOf(`probe:${m.probes[i].id}`);
	const saved = (key: string) => progress.state.answers[key] ?? null;
	const store = (key: string) => (state: AnswerState) => progress.saveAnswer(key, state);

	// 1 Predict: the animation stays locked until the learner commits.
	let picked = $state<Option | null>(null);
	let watched = $state(false);
	let probe1Done = $state(false);
	let replay = $state(0); // remounts the animation after a reset

	// On load, and when moving to another module (SvelteKit reuses this
	// component), restore the saved prediction or start fresh.
	$effect(() => {
		const ready = progress.loaded;
		void m.id;
		untrack(() => {
			const s = ready ? saved(predictKey) : null;
			const i = s ? Number(Object.keys(s.marks).find((k) => s.marks[Number(k)] === 'picked')) : NaN;
			picked = Number.isNaN(i) ? null : m.predict.options[i];
			watched = !!s?.watched;
			probe1Done = !!(ready && m.probes[0] && saved(probeKey(0))?.done);
		});
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

	function resetPredict() {
		progress.clearAnswer(predictKey);
		picked = null;
		watched = false;
		replay++;
	}

	// 2 Watch: each step raises its subskill to 1; the last step settles the prediction.
	// Plotting modules have plot steps (drawn by R) instead of table steps.
	const watchSteps = $derived<{ skill: string | null }[]>(m.plots?.length ? m.plots : m.anim);
	function onStep(i: number) {
		if (!picked) return;
		progress.raise(watchSteps[i].skill, 1);
		if (i === watchSteps.length - 1 && !watched) {
			watched = true;
			progress.patchAnswer(predictKey, { watched: true });
			if (progress.countOnce(predictKey)) {
				if (picked.correct) progress.raise(m.predict.skill, 2);
				progress.schedule({ id: `pred:${m.id}`, kind: 'predict', module: m.id, skill: m.predict.skill }, !!picked.correct);
			}
		}
	}

	// 3 Probe
	function onProbe(i: number, firstTry: boolean) {
		const p = m.probes[i];
		if (progress.countOnce(probeKey(i))) {
			progress.raise(p.skill, firstTry ? 2 : 1);
			progress.schedule({ id: `probe:${p.id}`, kind: 'probe', module: m.id, skill: p.skill }, firstTry);
		}
		if (i === 0) probe1Done = true;
	}

	// 4 Do: predict-type challenges can be answered here or on their own page;
	// both save under the same answer key.
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
		{#if progress.loaded}
			{#key replay}
				<Mcq
					q={m.predict}
					once
					onanswer={onPredict}
					note={predictNote}
					saved={saved(predictKey)}
					onstate={store(predictKey)}
					onreset={resetPredict}
					counted={progress.isCounted(predictKey)}
				/>
			{/key}
		{/if}
	</section>

	{#key replay}
		{#if m.plots?.length}
			<PlotStack steps={m.plots} locked={!picked} onstep={onStep} />
		{:else}
			<TableMorph steps={m.anim} locked={!picked} onstep={onStep} />
		{/if}
	{/key}

	{#if watched}
		<section class="card">
			<h2>3 · Probe</h2>
			{#each m.probes.slice(0, probe1Done ? 2 : 1) as p, i (p.id)}
				<div class:gap={i > 0}>
					<Mcq
						q={p}
						onanswer={(first) => onProbe(i, first)}
						saved={saved(probeKey(i))}
						onstate={store(probeKey(i))}
						onreset={() => progress.clearAnswer(probeKey(i))}
						counted={progress.isCounted(probeKey(i))}
					/>
				</div>
			{/each}
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
			<div class="ch" id="ch-{ch.id}">
				<div class="meta">
					<span class="tier {ch.tier}">{ch.tier}</span>
					<span class="tier">{ch.type}</span>
					<span class="tier">data: {ch.data}</span>
					{#if st}<span class="status" class:ok-text={st === 'clean'}>{statusLabel[st]}</span>{/if}
				</div>
				<p><b>{i + 1}.</b> {ch.prompt}</p>
				{#each rules(ch) as r (r)}<p class="small">{r}</p>{/each}
				{#if ch.type === 'predict'}
					{#each [ch.data, ...(ch.uses ?? [])] as d (d)}<DataColumns name={d} info={track.datasets[d]} />{/each}
					{#if progress.loaded}
						{@const akey = answerKey(track, m, ch)}
						<Mcq
							q={predictQuestion(ch)}
							onanswer={(first) => progress.countOnce(akey) && progress.predicted(key, ch, first)}
							saved={saved(akey)}
							onstate={store(akey)}
							onreset={() => progress.clearAnswer(akey)}
							counted={progress.isCounted(akey)}
						/>
					{/if}
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
