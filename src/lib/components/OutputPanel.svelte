<!--
	The console + test-results panel under the editor. Shared by function
	challenges (/c/[id]) and track challenges (/t/.../c/...).
-->
<script lang="ts">
	import { engine, type GradeResult, type RunResult } from '#lib/r/engine.svelte.ts';

	interface Props {
		panel: 'console' | 'results';
		runResult: RunResult | null;
		grade: GradeResult | null;
		runEmpty: string;
		gradeEmpty: string;
		gradingText: string;
	}

	let { panel = $bindable(), runResult, grade, runEmpty, gradeEmpty, gradingText }: Props = $props();

	const engineUp = $derived(engine.status === 'ready' || engine.status === 'busy');
	const passedCount = $derived(grade?.cases.filter((x) => x.status === 'pass').length ?? 0);

	/** Draw a captured R plot (ImageBitmap) onto a canvas. */
	function bitmap(canvas: HTMLCanvasElement, img: ImageBitmap) {
		canvas.width = img.width;
		canvas.height = img.height;
		canvas.getContext('2d')?.drawImage(img, 0, 0);
	}
</script>

<div class="output">
	<nav class="tabs small">
		<button class:active={panel === 'console'} onclick={() => (panel = 'console')}>Console</button>
		<button class:active={panel === 'results'} onclick={() => (panel = 'results')}>Test results</button>
		{#if !engineUp}<span class="muted status">{engine.detail || engine.status}</span>{/if}
	</nav>

	<div class="panel">
		{#if panel === 'console'}
			{#if engine.status === 'busy' && engine.detail === 'Running…'}
				<p class="muted">Running…</p>
			{:else if runResult}
				<pre class="console">{#each runResult.output as line, i (i)}<span class={line.type}>{line.type === 'error' ? 'Error: ' : line.type === 'warning' ? 'Warning: ' : ''}{line.text}{'\n'}</span>{/each}</pre>
				{#each runResult.images as img, i (i)}
					<canvas class="plot" use:bitmap={img}></canvas>
				{/each}
			{:else}
				<p class="muted">{runEmpty}</p>
			{/if}
		{:else if engine.status === 'busy' && engine.detail === 'Grading…'}
			<p class="muted">{gradingText}</p>
		{:else if grade}
			<div class="verdict" class:pass={grade.passed}>
				{#if grade.passed}
					Accepted
				{:else if grade.error}
					Error
				{:else if grade.structure.length}
					Rule violation
				{:else}
					Wrong answer
				{/if}
				<span class="muted small">
					{#if grade.cases.length}{passedCount} / {grade.cases.length} checks passed ·{/if}
					{(grade.ms / 1000).toFixed(1)}s
				</span>
			</div>

			{#if grade.error}<pre class="console"><span class="error">{grade.error}</span></pre>{/if}

			{#each grade.structure as problem (problem)}
				<div class="rule">⛔ {problem}</div>
			{/each}

			<ul class="cases">
				{#each grade.cases as k (k.name)}
					<li class={k.status}>
						<div class="case-head">
							<span class="icon">{k.status === 'pass' ? '✓' : '✗'}</span>
							{k.name}
							{#if k.hidden}<span class="tag">hidden</span>{/if}
						</div>
						{#if k.status !== 'pass'}
							{#if k.hidden && k.status === 'fail'}
								<p class="muted small">This is a hidden test, so the details stay hidden. Think about edge cases.</p>
							{/if}
							{#if k.detail}<pre>{k.detail}</pre>{/if}
							{#if k.input}
								<details>
									<summary>Input</summary>
									<pre>{k.input}</pre>
								</details>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">{gradeEmpty}</p>
		{/if}
	</div>
</div>

<style>
	.output {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--border);
		background: var(--panel);
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
	.status {
		margin-left: auto;
		font-size: 0.8rem;
	}
	.panel {
		padding: 0.75rem 1rem;
		overflow-y: auto;
		flex: 1;
	}
	.console {
		margin: 0;
		white-space: pre-wrap;
	}
	.console .stderr,
	.console .message {
		color: var(--muted);
	}
	.console .warning {
		color: var(--warn);
	}
	.console .error {
		color: var(--fail);
	}
	.plot {
		max-width: 100%;
		margin-top: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: #fff;
	}
	.verdict {
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--fail);
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}
	.verdict.pass {
		color: var(--pass);
	}
	.rule {
		color: var(--fail);
		margin: 0.35rem 0;
		font-size: 0.92rem;
	}
	.cases {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 0;
	}
	.cases li {
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--border);
	}
	.cases li pre {
		margin: 0.4rem 0 0.2rem;
		white-space: pre-wrap;
		font-size: 0.82rem;
	}
	.case-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.92rem;
	}
	.icon {
		width: 1rem;
		font-weight: 700;
	}
	.pass .icon {
		color: var(--pass);
	}
	.fail .icon,
	.error .icon {
		color: var(--fail);
	}
	.tag {
		font-size: 0.75rem;
		padding: 0.05rem 0.5rem;
		border-radius: 999px;
		background: var(--code-bg);
		color: var(--muted);
	}
	details summary {
		cursor: pointer;
		font-size: 0.82rem;
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
	}
	.small {
		font-size: 0.8rem;
	}
</style>
