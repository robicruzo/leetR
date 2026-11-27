<!--
	The layer stack: a plot built up step by step. Each step is complete ggplot
	code (checked to build by the content check); R draws it here, in the
	browser, the first time the step is shown. So every picture is real ggplot
	output, and each step shows what one more `+` changes.
-->
<script lang="ts">
	import { engine } from '#lib/r/engine.svelte.ts';

	interface Step {
		code: string;
		caption: string;
		skill: string | null;
	}
	interface Props {
		steps: Step[];
		locked?: boolean;
		onstep?: (index: number) => void;
	}

	let { steps, locked = false, onstep }: Props = $props();

	let step = $state(0);
	let images = $state<Record<number, ImageBitmap | string>>({});
	let drawing = $state(false);
	let timer: ReturnType<typeof setInterval> | null = null;
	let playing = $state(false);

	const engineUp = $derived(engine.status === 'ready' || engine.status === 'busy');
	const current = $derived(steps[step]);
	const image = $derived(images[step]);

	async function draw(i: number) {
		if (images[i] !== undefined || drawing) return;
		drawing = true;
		try {
			const res = await engine.runSnippet(steps[i].code);
			const err = res.output.find((o) => o.type === 'error');
			images[i] = res.images.at(-1) ?? (err ? `R could not draw this step: ${err.text}` : 'R drew nothing for this step.');
		} finally {
			drawing = false;
		}
	}

	// Draw the visible step once R is ready and the stack is unlocked.
	$effect(() => {
		if (!locked && engineUp && images[step] === undefined && !drawing) void draw(step);
	});

	function show(i: number) {
		step = Math.max(0, Math.min(steps.length - 1, i));
		onstep?.(step);
	}

	function togglePlay() {
		if (timer) return stop();
		playing = true;
		show(0);
		timer = setInterval(() => {
			if (drawing) return; // wait for R before moving on
			if (step >= steps.length - 1) stop();
			else show(step + 1);
		}, 2800);
	}

	function stop() {
		if (timer) clearInterval(timer);
		timer = null;
		playing = false;
	}

	$effect(() => stop);

	function paint(canvas: HTMLCanvasElement, img: ImageBitmap) {
		const put = (b: ImageBitmap) => {
			canvas.width = b.width;
			canvas.height = b.height;
			canvas.getContext('2d')?.drawImage(b, 0, 0);
		};
		put(img);
		return { update: put };
	}
</script>

<section class="stack" class:locked>
	<div class="head"><h2>2 · Watch</h2></div>
	<div class="stage">
		{#if image && typeof image === 'object'}
			<canvas use:paint={image} aria-label="Plot for step {step + 1} of {steps.length}"></canvas>
		{:else if typeof image === 'string'}
			<p class="note">{image}</p>
		{:else}
			<p class="note">{engineUp ? 'R is drawing this step…' : 'Waiting for R to start…'}</p>
		{/if}
	</div>
	<div class="lock">Make your prediction first. The plots answer it.</div>

	<pre class="code">{current.code}</pre>
	<p class="caption" aria-live="polite">{current.caption}</p>
	<div class="ctrl">
		<button onclick={() => show(step - 1)} disabled={locked || step === 0}>Back</button>
		<button onclick={() => show(step + 1)} disabled={locked || step === steps.length - 1}>Next step</button>
		<button onclick={togglePlay} disabled={locked}>{playing ? 'Pause' : 'Play from start'}</button>
		<div class="dots">
			{#each steps as _, k (k)}
				<button
					aria-label="Step {k + 1}"
					aria-current={k === step ? 'step' : undefined}
					disabled={locked}
					onclick={() => show(k)}>{k + 1}</button
				>
			{/each}
		</div>
	</div>
</section>

<style>
	.stack {
		position: relative;
		margin: 0 0 1.25rem;
	}
	.head {
		margin-bottom: 0.5rem;
	}
	h2 {
		margin: 0;
		font-size: 1.15rem;
	}
	.stage {
		display: grid;
		place-items: center;
		min-height: 260px;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
	}
	canvas {
		display: block;
		max-width: 100%;
		height: auto;
	}
	.note {
		color: #555;
		padding: 1rem;
	}
	.lock {
		display: none;
	}
	.locked .lock {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		text-align: center;
		padding: 1.25rem;
		border-radius: 12px;
		background: color-mix(in srgb, var(--tray) 82%, transparent);
		backdrop-filter: blur(5px);
		font-weight: 600;
	}
	.code {
		margin: 0.75rem 0 0;
	}
	.caption {
		margin: 0.75rem 0 0.6rem;
		min-height: 3.2em;
	}
	.ctrl {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.dots {
		display: flex;
		gap: 0.25rem;
		margin-left: auto;
		flex-wrap: wrap;
	}
	.dots button {
		width: 2rem;
		height: 2rem;
		padding: 0;
		border-radius: 50%;
		font-size: 0.75rem;
	}
	.dots button[aria-current='step'] {
		background: var(--text);
		color: var(--bg);
	}
</style>
