<!--
	A multiple-choice question that teaches through its wrong answers.
	Each wrong option names one misconception and carries a narrower `probe`
	question. After 3 misses (or when one option is left) the `explain` text
	appears instead. In `once` mode the first pick is final and the parent
	decides what to say (placement, predictions, reviews).
-->
<script lang="ts">
	import type { Mcq, Option } from '#lib/tracks.ts';

	interface Note {
		tone: 'ok' | 'bad' | 'plain';
		lead?: string;
		text: string;
	}

	interface Props {
		q: Mcq;
		once?: boolean;
		/** Called when the right option is found (or, in `once` mode, on the first pick). */
		onanswer?: (firstTry: boolean, option: Option) => void;
		/** Feedback controlled by the parent (used in `once` mode). */
		note?: Note | null;
	}

	let { q, once = false, onanswer, note = null }: Props = $props();

	let marks = $state<Record<number, 'right' | 'wrong' | 'picked'>>({});
	let misses = $state(0);
	let done = $state(false);
	let own = $state<Note | null>(null);

	const prose = $derived(q.options.some((o) => /\s/.test(o.choice) && o.choice.length > 28));
	const feedback = $derived(note ?? own);

	function pick(i: number) {
		if (done || marks[i]) return;
		const o = q.options[i];
		if (once) {
			done = true;
			marks[i] = 'picked';
			onanswer?.(!!o.correct, o);
			return;
		}
		if (o.correct) {
			done = true;
			marks[i] = 'right';
			own = { tone: 'ok', lead: 'Right.', text: q.right_followup ?? '' };
			onanswer?.(misses === 0, o);
			return;
		}
		misses++;
		marks[i] = 'wrong';
		const left = q.options.filter((_, k) => !marks[k]).length;
		own =
			(misses >= 3 || left <= 1) && q.explain
				? { tone: 'bad', lead: 'Here is the idea.', text: q.explain }
				: { tone: 'bad', lead: 'Not quite.', text: o.probe ?? 'Try another answer.' };
	}
</script>

<div class="mcq">
	{#if q.ask}<p class="ask">{q.ask}</p>{/if}
	{#if q.code}<pre>{q.code}</pre>{/if}
	<div class="opts" class:prose role="group" aria-label="Answers">
		{#each q.options as o, i (i)}
			<button class={marks[i]} disabled={done || !!marks[i]} onclick={() => pick(i)}>{o.choice}</button>
		{/each}
	</div>
	{#if feedback}
		<p class="fb" aria-live="polite">
			{#if feedback.lead}<b class={feedback.tone}>{feedback.lead}</b>{/if}
			{feedback.text}
		</p>
	{/if}
</div>

<style>
	.ask {
		margin: 0 0 0.6rem;
	}
	.opts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.25rem 0 0.6rem;
	}
	.opts button {
		font-family: var(--mono);
		font-size: 0.88rem;
		text-align: left;
		min-height: 2.5rem;
	}
	.opts.prose button {
		font-family: inherit;
		font-size: 0.95rem;
	}
	button:disabled {
		opacity: 1;
	}
	button.picked {
		border-color: var(--text);
		box-shadow: inset 0 0 0 1px var(--text);
	}
	button.right {
		border-color: var(--pass);
		color: var(--pass);
	}
	button.wrong {
		border-color: var(--fail);
		color: var(--fail);
		text-decoration: line-through;
	}
	.fb {
		margin: 0.25rem 0 0;
	}
	b.ok {
		color: var(--pass);
	}
	b.bad {
		color: var(--fail);
	}
</style>
