<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Editor from '#lib/components/Editor.svelte';
	import OutputPanel from '#lib/components/OutputPanel.svelte';
	import { engine, type GradeResult, type RunResult } from '#lib/r/engine.svelte.ts';
	import { clearDraft, getDraft, recordAttempt, saveDraft } from '#lib/db.ts';
	import { progressFor, type ChallengeStatus } from '#lib/progress.svelte.ts';
	import { challengeKey, shortTitle, snippetOptions, starterCode } from '#lib/tracks.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const track = $derived(data.track);
	const mod = $derived(data.mod);
	const ch = $derived(data.challenge);
	const key = $derived(challengeKey(track, mod, ch));
	const progress = $derived(progressFor(track));
	const number = $derived(mod ? mod.challenges.indexOf(ch) + 1 : null);
	const back = $derived(
		mod
			? { href: resolve('/t/[track]/m/[module]', { track: track.id, module: mod.id }), label: shortTitle(mod) }
			: { href: resolve('/t/[track]/final', { track: track.id }), label: 'Final assessment' }
	);

	let code = $state('');
	let loaded = $state(false);
	let editor = $state<ReturnType<typeof Editor>>();
	let tab = $state<'description' | 'hint' | 'solution'>('description');
	let reviewId = $state<string | undefined>();
	let counted = $state<ChallengeStatus | null>(null);

	let panel = $state<'console' | 'results'>('console');
	let runResult = $state<RunResult | null>(null);
	let grade = $state<GradeResult | null>(null);

	const working = $derived(engine.status === 'busy');
	const engineUp = $derived(engine.status === 'ready' || engine.status === 'busy');
	const hintOpen = $derived(progress.loaded && progress.openedToday(key, 'hint'));
	const solutionOpen = $derived(progress.loaded && progress.openedToday(key, 'solution'));
	const status = $derived(progress.state.status[key]);

	let saveTimer: ReturnType<typeof setTimeout>;
	function onchange(next: string) {
		code = next;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveDraft(key, next), 400);
	}

	onMount(async () => {
		// Read here, not in load(): prerendered pages have no query string.
		reviewId = new URLSearchParams(location.search).get('review') ?? undefined;
		await progress.load();
		const draft = await getDraft(key);
		code = draft?.code ?? starterCode(ch);
		loaded = true;
	});

	async function run() {
		if (working) return;
		panel = 'console';
		runResult = await engine.runSnippet(code);
	}

	async function submit() {
		if (working) return;
		panel = 'results';
		grade = null;
		const result = await engine.gradeSnippet(code, ch.solution ?? '', snippetOptions(ch));
		grade = result;
		await recordAttempt(key, result.passed, code);
		if (result.passed) counted = progress.solved(key, ch, mod?.id ?? 'final', reviewId);
	}

	async function reset() {
		if (!confirm('Replace your code with the starting code?')) return;
		await clearDraft(key);
		code = starterCode(ch);
		editor?.setValue(code);
	}

	function openHint() {
		progress.open(key, 'hint');
	}

	function revealSolution() {
		const warning = reviewId
			? 'Show the solution? This review will count as missed, and the skill drops one level.'
			: 'Show the reference solution? Solving it afterwards will not count today.';
		if (!confirm(warning)) return;
		progress.open(key, 'solution');
		if (reviewId) progress.gaveUpReview(reviewId);
	}

	const countedText: Record<ChallengeStatus, string> = {
		clean: 'Counted as a clean solve: no hint, no solution.',
		hinted: 'Counted as solved with help, because you opened the hint today.',
		seen: 'Accepted, but no credit today: you saw the solution.'
	};
	const rules = $derived(
		[
			ch.forbid?.length ? ['Not allowed', ch.forbid] : null,
			ch.require?.length ? ['Must use', ch.require] : null
		].filter((x): x is [string, string[]] => x !== null)
	);
</script>

<svelte:head><title>{mod ? `${shortTitle(mod)} #${number}` : 'Integrative problem'} · leetR</title></svelte:head>

<div class="workspace">
	<section class="left">
		<nav class="tabs">
			<button class:active={tab === 'description'} onclick={() => (tab = 'description')}>Description</button>
			<button class:active={tab === 'hint'} onclick={() => (tab = 'hint')}>Hint</button>
			<button class:active={tab === 'solution'} onclick={() => (tab = 'solution')}>Solution</button>
		</nav>

		<div class="content">
			{#if tab === 'description'}
				<a class="back" href={back.href}>← {back.label}</a>
				{#if reviewId}<p class="review">Review: solve it without the hint to keep the skill climbing.</p>{/if}
				<h1>
					{mod ? `Challenge ${number}` : 'Integrative problem'}
					{#if status === 'clean'}<span class="solved" title="Solved cleanly">✓</span>{/if}
				</h1>
				<div class="meta">
					<span class="tier {ch.tier}">{ch.tier}</span>
					<span class="tier">{ch.type}</span>
					<span class="tier">data: {ch.data}</span>
				</div>
				<p class="prompt">{ch.prompt}</p>
				{#each rules as [label, toks] (label)}
					<p class="small">{label}: {#each toks as t (t)}<code>{t}</code> {/each}</p>
				{/each}
				{#if ch.type === 'fix' && ch.starter_error}
					<p class="small">The starting code fails with: <code>{ch.starter_error.split('\n')[0]}</code></p>
				{/if}
				<details>
					<summary>Expected result</summary>
					<p class="small">
						{ch.dims ?? ''}{ch.compare?.ignore_row_order ? ' · row order is not checked' : ''}{ch.compare
							?.ignore_column_order
							? ' · column order is not checked'
							: ''}
					</p>
					<pre>{ch.expected}</pre>
				</details>
				<p class="small">
					Your code's last value is the answer. It runs on <code>{ch.data}</code>; Submit also re-runs it on half of
					<code>{ch.data}</code>, so the answer has to be computed, not typed in.
				</p>
			{:else if tab === 'hint'}
				{#if hintOpen || solutionOpen}
					<p>{ch.hint ?? 'This one has no hint.'}</p>
				{:else}
					<p class="muted">Opening the hint is fine. A solve after it counts as "with help" today.</p>
					<button onclick={openHint}>Show the hint</button>
				{/if}
			{:else if solutionOpen || status === 'clean'}
				<pre><code>{ch.solution}</code></pre>
				{#if ch.explain}<p>{ch.explain}</p>{/if}
			{:else}
				<p class="muted">The reference solution. Try the hint first.</p>
				<button onclick={revealSolution}>Reveal solution</button>
			{/if}
		</div>
	</section>

	<section class="right">
		<div class="toolbar">
			<span class="muted small">R · <kbd>⌘↵</kbd> run · <kbd>⌘⇧↵</kbd> submit</span>
			<div class="actions">
				<button onclick={reset} title="Reset to the starting code">Reset</button>
				<button
					onclick={() => engine.restart()}
					disabled={engine.status === 'restarting' || engine.status === 'booting'}
					title="Kill and restart the R session">Restart R</button
				>
				<button onclick={run} disabled={!engineUp || working}>Run</button>
				<button class="primary" onclick={submit} disabled={!engineUp || working}>Submit</button>
			</div>
		</div>

		<div class="editor">
			{#if loaded}
				<Editor bind:this={editor} value={code} {onchange} onrun={run} onsubmit={submit} />
			{/if}
		</div>

		<div class="bottom">
			{#if counted && grade?.passed}<p class="counted" class:clean={counted === 'clean'}>{countedText[counted]}</p>{/if}
			<OutputPanel
				bind:panel
				{runResult}
				{grade}
				runEmpty="Run your code to see its result here."
				gradeEmpty="Submit to compare your result with the reference, on the full data and on a sample of it."
				gradingText="Grading: comparing with the reference, then re-running on a sample of the data…"
			/>
		</div>
	</section>
</div>

<style>
	.workspace {
		display: grid;
		grid-template-columns: minmax(340px, 42%) 1fr;
		height: 100%;
	}
	.left {
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--border);
		background: var(--panel);
		min-height: 0;
	}
	.right {
		display: grid;
		grid-template-rows: auto 1fr minmax(200px, 40%);
		min-height: 0;
	}
	.tabs {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.4rem 0.75rem;
		border-bottom: 1px solid var(--border);
	}
	.tabs button {
		border: none;
		background: none;
		color: var(--muted);
		padding: 0.3rem 0.65rem;
	}
	.tabs button.active {
		color: var(--text);
		background: var(--active-line);
		font-weight: 600;
	}
	.content {
		padding: 1.25rem 1.5rem 2rem;
		overflow-y: auto;
	}
	.back {
		font-size: 0.85rem;
		text-decoration: none;
	}
	.review {
		margin: 0.6rem 0 0;
		padding: 0.4rem 0.7rem;
		border-left: 3px solid var(--accent);
		background: var(--active-line);
		font-size: 0.9rem;
	}
	h1 {
		margin: 0.5rem 0 0.4rem;
		font-size: 1.45rem;
	}
	.solved {
		color: var(--pass);
	}
	.meta {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.8rem;
		flex-wrap: wrap;
	}
	.prompt {
		font-size: 1.05rem;
	}
	details {
		margin: 0.75rem 0;
	}
	details summary {
		cursor: pointer;
		font-weight: 600;
	}
	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.45rem 0.75rem;
		border-bottom: 1px solid var(--border);
		background: var(--panel);
	}
	.actions {
		display: flex;
		gap: 0.4rem;
	}
	kbd {
		font-family: var(--mono);
		font-size: 0.75rem;
	}
	.editor {
		min-height: 0;
		background: var(--editor-bg);
	}
	.bottom {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.bottom :global(.output) {
		flex: 1;
	}
	.counted {
		margin: 0;
		padding: 0.4rem 1rem;
		font-size: 0.88rem;
		border-top: 1px solid var(--border);
		background: var(--panel);
		color: var(--warn);
	}
	.counted.clean {
		color: var(--pass);
	}
	.muted {
		color: var(--muted);
	}
	@media (max-width: 860px) {
		.workspace {
			grid-template-columns: 1fr;
			grid-template-rows: auto 80vh;
			height: auto;
		}
	}
</style>
