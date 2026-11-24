<!--
	The table-morph animation ("sorting tray"). Every cell is a tile keyed by
	`rowKey|columnId`, so a tile keeps its identity from one step to the next
	and CSS transitions move, merge and fade it. All tables are real R output,
	captured by the content check (scripts/content/build.R).

	When rows collapse (a step with `merged`), group-key tiles from every source
	row slide onto one result cell, and the `pour` source column's tiles flow
	into the new summary cell and fade.
-->
<script lang="ts">
	import type { AnimStep } from '#lib/tracks.ts';

	interface Props {
		steps: AnimStep[];
		locked?: boolean;
		/** Called whenever a step is shown. */
		onstep?: (index: number) => void;
	}

	let { steps, locked = false, onstep }: Props = $props();

	let step = $state(0);
	let width = $state(640);
	let timer: ReturnType<typeof setInterval> | null = null;
	let playing = $state(false);

	const PAD = 10;
	const ROW_H = 36;
	// Penguin species keep their palmerpenguins colours; any other tint values
	// (countries, say) take the same colours in order of first appearance.
	const SPECIES: Record<string, string> = { Adelie: 'adelie', Chinstrap: 'chinstrap', Gentoo: 'gentoo' };
	const PALETTE = ['adelie', 'chinstrap', 'gentoo', 'extra'];
	const valueClass = (v: string) => (v === 'TRUE' ? 'lt' : v === 'FALSE' ? 'lf' : v === 'NA' ? 'na' : '');

	interface Tile {
		id: string;
		c: number;
		r: number;
		txt: string;
		cls: string;
		op: number;
	}

	/** Row positions; bands leave half a row between tint groups. */
	function rowsOf(s: AnimStep): number[] {
		let r = 1;
		let last: string | undefined | null = null;
		return s.rows.map((row) => {
			if (s.bands && last !== null && row.t !== last) r += 0.5;
			last = row.t;
			return r++;
		});
	}

	const tintOrder = $derived([
		...new Set(
			steps
				.flatMap((s) => (s.tint ? [...s.rows, ...(s.side?.rows ?? [])].map((r) => r.t ?? '') : []))
				.filter((t) => t && !SPECIES[t])
		)
	]);
	const tintClass = (t: string) => SPECIES[t] ?? PALETTE[tintOrder.indexOf(t) % PALETTE.length] ?? '';

	function layout(s: AnimStep): Tile[] {
		const list: Tile[] = [];
		const placed = new Set<string>();
		const put = (id: string, c: number, r: number, txt: string, cls: string, op = 1) => {
			if (placed.has(id)) return;
			placed.add(id);
			list.push({ id, c, r, txt, cls, op });
		};
		const rpos = rowsOf(s);
		s.cols.forEach((name, i) => put('h|' + s.ids[i], i, 0, name, 'hdr'));
		s.rows.forEach((row, ri) => {
			const r = rpos[ri];
			const tint = s.tint && row.t ? tintClass(row.t) : '';
			s.cols.forEach((name, i) => {
				const v = row.v[i];
				const cls = [tint, valueClass(v)].filter(Boolean).join(' ');
				if (s.merged && row.from && (s.by ?? []).includes(name)) {
					// Group keys: every source row's tile lands on the one result cell.
					row.from.forEach((src, j) => put(src + '|' + s.ids[i], i, r, v, cls, j === 0 ? 1 : 0));
				} else if (s.merged && row.from && s.pour?.[name]) {
					// Summaries: the source column's tiles pour into the new cell.
					const srcCol = s.pour[name];
					row.from.forEach((src) => put(src + '|' + srcCol, i, r, '', cls, 0));
					put(row.k + '|' + s.ids[i], i, r, v, [cls, 'sum'].filter(Boolean).join(' '));
				} else {
					// After a split or widen, a cell can name the tile it came from.
					// If that tile is already placed in this step, this cell is a copy.
					const src = row.src?.[i];
					put(src && !placed.has(src) ? src : row.k + '|' + s.ids[i], i, r, v, cls);
				}
			});
		});
		if (s.side) {
			// The second table of a join, one empty column to the right. Rows
			// are tinted by their key, so matching keys share a colour.
			const off = s.cols.length + 1;
			s.side.cols.forEach((name, i) => put('h|' + s.side!.ids[i], off + i, 0, name, 'hdr'));
			s.side.rows.forEach((row, ri) => {
				const tint = s.tint && row.t ? tintClass(row.t) : '';
				s.side!.cols.forEach((_, i) => {
					const v = row.v[i];
					put(row.k + '|' + s.side!.ids[i], off + i, ri + 1, v, [tint, valueClass(v)].filter(Boolean).join(' '));
				});
			});
		}
		if (s.bands) {
			const counts: Record<string, number> = {};
			for (const row of s.rows) counts[row.t ?? ''] = (counts[row.t ?? ''] ?? 0) + 1;
			const seen = new Set<string>();
			s.rows.forEach((row, ri) => {
				const t = row.t ?? '';
				if (seen.has(t)) return;
				seen.add(t);
				put('note|' + t, s.cols.length, rpos[ri], `${t}: ${counts[t]} rows`, 'note');
			});
		}
		return list;
	}

	const frames = $derived(steps.map(layout));
	const ncols = $derived(
		Math.max(...steps.map((s) => s.cols.length + (s.bands ? 1 : 0) + (s.side ? s.side.cols.length + 1 : 0)))
	);
	const nrows = $derived(Math.max(...steps.map((s) => Math.max(rowsOf(s).at(-1) ?? 1, s.side?.rows.length ?? 0))));
	const allIds = $derived([...new Set(frames.flatMap((f) => f.map((t) => t.id)))]);

	/**
	 * Every tile of the whole animation, placed for the current step. A tile
	 * that is not in this step stays where it was last seen (or waits where it
	 * will first appear) at opacity 0, so it fades rather than jumps.
	 */
	const tiles = $derived.by(() => {
		const byFrame = frames.map((f) => new Map(f.map((t) => [t.id, t])));
		return allIds.map((id) => {
			const here = byFrame[step].get(id);
			let txt = here?.txt ?? '';
			if (!txt) {
				for (let j = step; j >= 0 && !txt; j--) txt = byFrame[j].get(id)?.txt ?? '';
				for (let j = step + 1; j < frames.length && !txt; j++) txt = byFrame[j].get(id)?.txt ?? '';
			}
			if (here) return { ...here, txt };
			let ghost: Tile | undefined;
			for (let j = step - 1; j >= 0 && !ghost; j--) ghost = byFrame[j].get(id);
			for (let j = step + 1; j < frames.length && !ghost; j++) ghost = byFrame[j].get(id);
			return { ...ghost!, txt, op: 0 };
		});
	});

	const colW = $derived(Math.min(170, (width - 2 * PAD) / ncols));
	const current = $derived(steps[step]);

	function show(i: number) {
		step = Math.max(0, Math.min(steps.length - 1, i));
		onstep?.(step);
	}

	function togglePlay() {
		if (timer) {
			stop();
			return;
		}
		playing = true;
		show(0);
		timer = setInterval(() => {
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
</script>

<section class="tray" class:locked>
	<div class="head">
		<h2>2 · Watch</h2>
		<span class="badge" class:empty={!current.badge}>{current.badge}</span>
	</div>
	<div
		class="stage"
		bind:clientWidth={width}
		style:height="{2 * PAD + (nrows + 1) * ROW_H}px"
		role="img"
		aria-label="Animated table, step {step + 1} of {steps.length}"
	>
		{#each tiles as t (t.id)}
			<div
				class="tile {t.cls}"
				title={t.txt}
				style:width="{colW - 6}px"
				style:transform="translate({PAD + t.c * colW}px, {PAD + t.r * ROW_H}px)"
				style:opacity={t.op}
			>
				{t.txt}
			</div>
		{/each}
	</div>
	<div class="lock">Make your prediction first. The animation answers it.</div>

	<pre class="code">{current.show ?? ''}</pre>
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
	.tray {
		position: relative;
		margin: 0 0 1.25rem;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}
	h2 {
		margin: 0;
		font-size: 1.15rem;
	}
	.badge {
		font: 600 0.8rem var(--mono);
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: var(--text);
		color: var(--bg);
		transition: opacity 0.3s;
	}
	.badge.empty {
		opacity: 0;
	}
	.stage {
		position: relative;
		background: var(--tray);
		border-radius: 12px;
		overflow: hidden;
	}
	.tile {
		position: absolute;
		left: 0;
		top: 0;
		height: 30px;
		display: flex;
		align-items: center;
		padding: 0 8px;
		border-radius: 6px;
		font: 0.82rem var(--mono);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		background: var(--panel);
		border: 1px solid var(--border);
		transition:
			transform 0.65s cubic-bezier(0.3, 0.7, 0.2, 1),
			opacity 0.5s,
			background-color 0.5s,
			border-color 0.5s,
			width 0.5s;
	}
	.tile.hdr {
		background: transparent;
		border-color: transparent;
		font-weight: 600;
		color: var(--muted);
	}
	.tile.adelie,
	.tile.chinstrap,
	.tile.gentoo,
	.tile.extra {
		border-width: 2px;
	}
	.tile.extra {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, var(--panel));
	}
	.tile.adelie {
		border-color: var(--adelie);
		background: color-mix(in srgb, var(--adelie) 16%, var(--panel));
	}
	.tile.chinstrap {
		border-color: var(--chinstrap);
		background: color-mix(in srgb, var(--chinstrap) 14%, var(--panel));
	}
	.tile.gentoo {
		border-color: var(--gentoo);
		background: color-mix(in srgb, var(--gentoo) 16%, var(--panel));
	}
	.tile.lt {
		color: var(--pass);
		font-weight: 600;
	}
	.tile.lf {
		color: var(--muted);
	}
	.tile.na {
		color: var(--fail);
		font-style: italic;
	}
	.tile.note {
		background: transparent;
		border: 0;
		color: var(--muted);
		font-family: inherit;
		font-weight: 600;
	}
	.tile.sum {
		font-weight: 600;
		outline: 2px solid var(--text);
		outline-offset: -2px;
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
	@media (prefers-reduced-motion: reduce) {
		.tile {
			transition: none !important;
		}
	}
	@media (max-width: 600px) {
		.tile {
			font-size: 0.7rem;
			padding: 0 5px;
		}
		.dots {
			margin-left: 0;
		}
	}
</style>
