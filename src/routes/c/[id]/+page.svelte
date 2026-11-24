<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Editor from '#lib/components/Editor.svelte';
	import OutputPanel from '#lib/components/OutputPanel.svelte';
	import { engine, type GradeResult, type RunResult } from '#lib/r/engine.svelte.ts';
	import { clearDraft, getDraft, recordAttempt, saveDraft, solvedIds } from '#lib/db.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const c = $derived(data.challenge);

	let code = $state('');
	let loaded = $state(false);
	let editor = $state<ReturnType<typeof Editor>>();
	let tab = $state<'description' | 'hints' | 'solution'>('description');
	let hintsShown = $state(0);
	let solutionShown = $state(false);
	let solved = $state(false);

	let panel = $state<'console' | 'results'>('console');
	let runResult = $state<RunResult | null>(null);
	let grade = $state<GradeResult | null>(null);

	const working = $derived(engine.status === 'busy');
	const engineUp = $derived(engine.status === 'ready' || engine.status === 'busy');

	let saveTimer: ReturnType<typeof setTimeout>;
	function onchange(next: string) {
		code = next;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveDraft(c.id, next), 400);
	}

	onMount(async () => {
		const draft = await getDraft(c.id);
		code = draft?.code ?? c.starter;
		solved = (await solvedIds()).has(c.id);
		loaded = true;
	});

	async function run() {
		if (working) return;
		panel = 'console';
		runResult = await engine.run(code, c.tests, c.fnName);
	}

	async function submit() {
		if (working) return;
		panel = 'results';
		grade = null;
		const result = await engine.grade(code, c.solution, c.tests, c.gradeOptions);
		grade = result;
		await recordAttempt(c.id, result.passed, code);
		if (result.passed) solved = true;
	}

	async function reset() {
		if (!confirm('Replace your code with the starter code?')) return;
		await clearDraft(c.id);
		code = c.starter;
		editor?.setValue(c.starter);
	}

	function revealSolution() {
		if (solutionShown || confirm('Show the reference solution? Try the hints first!')) solutionShown = true;
	}


</script>

<svelte:head><title>{c.title} · leetR</title></svelte:head>

<div class="workspace">
	<section class="left">
		<nav class="tabs">
			<button class:active={tab === 'description'} onclick={() => (tab = 'description')}>Description</button>
			<button class:active={tab === 'hints'} onclick={() => (tab = 'hints')}>
				Hints {hintsShown ? `(${hintsShown}/${c.hints.length})` : ''}
			</button>
			<button class:active={tab === 'solution'} onclick={() => (tab = 'solution')}>Solution</button>
		</nav>

		<div class="content">
			{#if tab === 'description'}
				<a class="back" href={resolve('/')}>← All challenges</a>
				<h1>{c.title} {#if solved}<span class="solved" title="Solved">✓</span>{/if}</h1>
				<div class="meta">
					<span class="difficulty {c.difficulty}">{c.difficulty}</span>
					{#each c.tags as t (t)}<span class="tag">{t}</span>{/each}
				</div>
				<div class="prose">{@html c.promptHtml}</div>
			{:else if tab === 'hints'}
				{#each c.hints.slice(0, hintsShown) as h (h.title)}
					<div class="hint">
						<h3>{h.title}</h3>
						<div class="prose">{@html h.html}</div>
					</div>
				{/each}
				{#if hintsShown < c.hints.length}
					<button onclick={() => hintsShown++}>
						{hintsShown === 0 ? 'Show the first hint' : 'Show the next hint'}
					</button>
				{:else}
					<p class="muted">That's every hint. The full solution is in the Solution tab.</p>
				{/if}
			{:else}
				{#if solutionShown || solved}
					<pre><code>{c.solution}</code></pre>
					<div class="prose">{@html c.explanationHtml}</div>
				{:else}
					<p class="muted">The reference solution and an explanation of the idea behind it.</p>
					<button onclick={revealSolution}>Reveal solution</button>
				{/if}
			{/if}
		</div>
	</section>

	<section class="right">
		<div class="toolbar">
			<span class="muted small">R · <kbd>⌘↵</kbd> run · <kbd>⌘⇧↵</kbd> submit</span>
			<div class="actions">
				<button onclick={reset} title="Reset to starter code">Reset</button>
				<button onclick={() => engine.restart()} disabled={engine.status === 'restarting' || engine.status === 'booting'} title="Kill and restart the R session">
					Restart R
				</button>
				<button onclick={run} disabled={!engineUp || working}>Run</button>
				<button class="primary" onclick={submit} disabled={!engineUp || working}>Submit</button>
			</div>
		</div>

		<div class="editor">
			{#if loaded}
				<Editor bind:this={editor} value={code} {onchange} onrun={run} onsubmit={submit} />
			{/if}
		</div>

		<OutputPanel
			bind:panel
			{runResult}
			{grade}
			runEmpty="Run your function on the examples to see the output here."
			gradeEmpty="Submit to check your function against hidden tests and random inputs."
			gradingText="Grading: running hidden tests and random inputs…"
		/>
	</section>
</div>

<style>
	.workspace {
		display: grid;
		grid-template-columns: minmax(340px, 44%) 1fr;
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
		grid-template-rows: auto 1fr minmax(180px, 38%);
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
	h1 {
		margin: 0.5rem 0 0.4rem;
		font-size: 1.45rem;
		letter-spacing: -0.01em;
	}
	.solved {
		color: var(--pass);
	}
	.meta {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 1rem;
	}
	.tag {
		font-size: 0.75rem;
		padding: 0.05rem 0.5rem;
		border-radius: 999px;
		background: var(--code-bg);
		color: var(--muted);
	}
	.prose :global(table) {
		border-collapse: collapse;
		margin: 0.75rem 0;
		font-size: 0.9rem;
	}
	.prose :global(th),
	.prose :global(td) {
		border: 1px solid var(--border);
		padding: 0.3rem 0.6rem;
		text-align: left;
	}
	.prose :global(h3) {
		font-size: 1rem;
		margin-top: 1.5rem;
	}
	.hint {
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.25rem 1rem;
		margin-bottom: 0.75rem;
	}
	.hint h3 {
		font-size: 0.9rem;
		margin: 0.6rem 0 0;
		color: var(--muted);
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
	.muted {
		color: var(--muted);
	}
	.small {
		font-size: 0.8rem;
	}
	@media (max-width: 860px) {
		.workspace {
			grid-template-columns: 1fr;
			grid-template-rows: auto 80vh;
			height: auto;
		}
	}
</style>
