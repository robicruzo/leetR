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

	// Draw the visible step once R is ready and the stack is unlocked, then the
	// next one in the background so "Next step" usually has its picture ready.
	$effect(() => {
		if (locked || !engineUp || drawing) return;
		if (images[step] === undefined) void draw(step);
		else if (step + 1 < steps.length && images[step + 1] === undefined) void draw(step + 1);
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

	// One canvas for the whole stack, never removed: each step paints over the
	// last, and until the new picture arrives the previous one stays on it (dimmed),
	// so the white sheet keeps its size between steps instead of collapsing.
	let canvas = $state<HTMLCanvasElement>();
	let shown = $state(-1); // which step's picture is on the canvas
	$effect(() => {
		const img = image;
		if (!canvas || img === undefined || shown === step) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		if (typeof img === 'object') {
			canvas.width = img.width;
			canvas.height = img.height;
			ctx.drawImage(img, 0, 0);
		} else {
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		shown = step;
	});
	const note = $derived(
		typeof image === 'string'
			? image
			: image === undefined
				? engineUp
					? `R is drawing step ${step + 1}…`
					: 'Waiting for R to start…'
				: ''
	);
</script>

<section class="stack" class:locked>
	<div class="head"><h2>2 · Watch</h2></div>
	<div class="stage">
		<canvas
			bind:this={canvas}
			width="1280"
			height="800"
			class:stale={shown !== step}
			aria-label="Plot for step {step + 1} of {steps.length}"
		></canvas>
		{#if note}<p class="note" class:error={typeof image === 'string'}>{note}</p>{/if}
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
	/* A fixed white sheet with the device's shape (640 × 400), whatever is on it. */
	.stage {
		position: relative;
		aspect-ratio: 640 / 400;
		max-width: 640px;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		transition: opacity 0.15s;
	}
	canvas.stale {
		opacity: 0.35;
	}
	.note {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		padding: 1rem;
		text-align: center;
		color: #555;
	}
	.note.error {
		color: #a33;
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
