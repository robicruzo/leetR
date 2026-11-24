<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import DataTable from '#lib/components/DataTable.svelte';
	import Mcq from '#lib/components/Mcq.svelte';
	import TrackNav from '#lib/components/TrackNav.svelte';
	import { progressFor, REVIEW_DAYS, type ReviewItem } from '#lib/progress.svelte.ts';
	import { challengeKey, getModule, shortTitle, type Option } from '#lib/tracks.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const track = $derived(data.track);
	const progress = $derived(progressFor(track));

	// The list is fixed when the page opens, so answered items stay on screen
	// with their feedback instead of vanishing.
	let items = $state<ReviewItem[]>([]);
	let notes = $state<Record<string, { tone: 'ok' | 'bad'; lead: string; text: string }>>({});
	let armed = $state(false);

	function refresh() {
		items = progress.due();
		notes = {};
	}
	onMount(async () => {
		await progress.load();
		refresh();
	});

	// Pages are prerendered as <path>/index.html: link to the slash form so the
	// query string never goes through a redirect.
	const withSlash = (p: string) => p.replace(/\/?$/, '/');

	const later = $derived(progress.loaded ? progress.upcoming() : []);

	function question(r: ReviewItem) {
		const m = getModule(track, r.module);
		if (!m) return null;
		if (r.kind === 'predict') return m.predict;
		if (r.kind === 'probe') return m.probes.find((p) => `probe:${p.id}` === r.id) ?? null;
		return null;
	}

	function challengeFor(r: ReviewItem) {
		const m = getModule(track, r.module);
		if (!m) return null;
		const pool = m.challenges.filter((c) => c.skill === r.skill && c.type !== 'predict');
		const ch = pool.find((c) => progress.state.status[challengeKey(track, m, c)] !== 'clean') ?? pool[0];
		return ch ? { m, ch } : null;
	}

	function answered(r: ReviewItem, ok: boolean, o: Option) {
		progress.schedule(r, ok);
		if (!ok) progress.lower(r.skill);
		const q = question(r);
		notes[r.id] = ok
			? { tone: 'ok', lead: 'Right.', text: `Next review in ${REVIEW_DAYS[progress.state.reviews[r.id].step]} days.` }
			: {
					tone: 'bad',
					lead: 'Not this time.',
					text: `${q?.explain ?? o.probe ?? ''} The skill drops a level and comes back tomorrow.`
				};
	}

	function shift(days: number | null) {
		progress.shiftClock(days);
		refresh();
	}

	function wipe() {
		if (!armed) {
			armed = true;
			return;
		}
		progress.reset();
		armed = false;
		refresh();
	}
</script>

<svelte:head><title>Review · Track {track.number} · leetR</title></svelte:head>

<div class="page">
	<TrackNav {track} {progress} here="Review" />
	<h1>Review</h1>
	<p class="lede">
		Questions come back after 1, 3, 7 and 21 days. A miss drops that skill one level and restarts its interval. A
		challenge solved cleanly here, on a later day than your first clean solve, is what earns level 4.
	</p>

	{#if progress.loaded && !items.length}
		<section class="card">
			<p>
				Nothing is due today.
				{#if later.length}
					Next review: {later.length} item{later.length > 1 ? 's' : ''}, the first in
					{later[0].due - progress.today()} day{later[0].due - progress.today() > 1 ? 's' : ''}.
				{:else}
					Answer some predictions and probes in the modules first.
				{/if}
			</p>
		</section>
	{/if}

	{#each items as r (r.id)}
		{@const m = getModule(track, r.module)}
		<section class="card">
			<p class="small">{m ? shortTitle(m) : r.module} · {progress.skills.get(r.skill)?.name ?? r.skill}</p>
			{#if r.kind === 'challenge'}
				{@const found = challengeFor(r)}
				{#if found}
					<p>{found.ch.prompt}</p>
					<a
						class="btn primary"
						href="{withSlash(
							resolve('/t/[track]/m/[module]/c/[challenge]', {
								track: track.id,
								module: found.m.id,
								challenge: found.ch.id
							})
						)}?review={encodeURIComponent(r.id)}">Solve it in the editor →</a
					>
				{/if}
			{:else}
				{@const q = question(r)}
				{#if q}
					{#if r.kind === 'predict' && m?.predict.data_table}<DataTable table={m.predict.data_table} />{/if}
					<Mcq {q} once onanswer={(ok, o) => answered(r, ok, o)} note={notes[r.id] ?? null} />
				{/if}
			{/if}
		</section>
	{/each}

	<details class="card">
		<summary>Preview control</summary>
		<p class="small">
			Reviews depend on real days passing. To try them now, move this track's clock forward. Clock offset:
			{progress.state.offset} day(s).
		</p>
		<div class="row">
			<button onclick={() => shift(1)}>Move the clock forward 1 day</button>
			<button onclick={() => shift(null)}>Reset the clock</button>
			<button onclick={wipe}>{armed ? 'Click again to erase everything' : 'Erase all progress in this track'}</button>
		</div>
	</details>
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
	summary {
		cursor: pointer;
		font-weight: 600;
	}
	.row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
</style>
