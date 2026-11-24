<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { challenges } from '#lib/challenges.ts';
	import { tracks } from '#lib/tracks.ts';
	import { solvedIds, streak } from '#lib/db.ts';

	let solved = $state(new Set<string>());
	let days = $state(0);

	onMount(async () => {
		solved = await solvedIds();
		days = await streak();
	});

	const practice = $derived(Map.groupBy(challenges, (c) => c.track));
</script>

<svelte:head><title>leetR: R challenges, in your browser</title></svelte:head>

<div class="page">
	<section class="intro">
		<h1>Sharpen your R.</h1>
		<p>
			Challenges graded by real R running in your browser via WebAssembly. No account, no server, and it
			works offline.
		</p>
		<div class="stats">
			<span><strong>{solved.size}</strong> / {challenges.length} solved</span>
			<span><strong>{days}</strong> day streak</span>
		</div>
	</section>

	<section>
		<h2>Tracks</h2>
		<ul>
			{#each tracks as t (t.id)}
				<li>
					<a class="track" href={resolve('/t/[track]', { track: t.id })}>
						<span class="num">{t.number}</span>
						<span>
							<span class="title">{t.title}</span>
							<span class="summary">{t.summary}</span>
						</span>
						<span class="tags">{t.modules.length} modules · {t.built.counts.challenges} challenges</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>

	{#each practice as [group, list] (group)}
		<section>
			<h2>Practice · {group}</h2>
			<ul>
				{#each list as c (c.id)}
					<li>
						<a href={resolve('/c/[id]', { id: c.id })}>
							<span class="check" class:done={solved.has(c.id)}>{solved.has(c.id) ? '✓' : ''}</span>
							<span class="title">{c.title}</span>
							<span class="tags">{c.tags.join(' · ')}</span>
							<span class="difficulty {c.difficulty}">{c.difficulty}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

<style>
	.page {
		max-width: 820px;
		margin: 0 auto;
		padding: 2.5rem 1.25rem;
	}
	h1 {
		margin: 0 0 0.4rem;
		font-size: 2rem;
		letter-spacing: -0.02em;
	}
	.intro p {
		margin: 0;
		color: var(--muted);
		max-width: 60ch;
	}
	.stats {
		display: flex;
		gap: 1.5rem;
		margin-top: 1rem;
		font-size: 0.9rem;
		color: var(--muted);
	}
	.stats strong {
		color: var(--text);
	}
	h2 {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		margin: 2.5rem 0 0.6rem;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--panel);
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	li a {
		display: grid;
		grid-template-columns: 1.5rem 1fr auto 4.5rem;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		color: var(--text);
		text-decoration: none;
	}
	li a:hover {
		background: var(--active-line);
	}
	.check {
		color: var(--pass);
		font-weight: 700;
	}
	.title {
		font-weight: 500;
	}
	.tags {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.difficulty {
		text-align: right;
	}
	li a.track {
		grid-template-columns: 1.5rem 1fr auto;
	}
	.num {
		font-weight: 700;
		color: var(--accent);
	}
	.summary {
		display: block;
		font-size: 0.85rem;
		color: var(--muted);
	}
</style>
