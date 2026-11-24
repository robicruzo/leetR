// Skill levels, spaced review and challenge status for a track, kept in
// IndexedDB (one record per track). The rules (CLAUDE.md §3), strictly:
//
//   1  heard of it        a right placement answer, or an animation step watched
//   2  follows along      a prediction or probe right on the first try
//   3  does it with help  a challenge accepted after opening its hint
//   4  independent        clean solves (accepted, no hint, no solution) on two
//                         different days, at least one of them from a review
//   5  can teach it       on top of 4, a stretch or brain-melter solved cleanly
//
// Reviews come back after 1, 3, 7 and 21 days. A missed review drops the skill
// one level and restarts its interval.

import { db } from './db.ts';
import type { Track, TrackChallenge } from './tracks.ts';
import { skillsOf } from './tracks.ts';

export const REVIEW_DAYS = [1, 3, 7, 21];

export type ReviewKind = 'predict' | 'probe' | 'challenge';

export interface ReviewItem {
	id: string; // "pred:<module>", "probe:<probe id>", "ch:<skill>"
	kind: ReviewKind;
	module: string;
	skill: string;
	step: number; // index into REVIEW_DAYS; -1 before the first answer
	due: number; // day number
}

export type ChallengeStatus = 'clean' | 'hinted' | 'seen';

export interface ProgressState {
	levels: Record<string, number>;
	cleanSolves: Record<string, { day: number; review: boolean }[]>;
	reviews: Record<string, ReviewItem>;
	status: Record<string, ChallengeStatus>; // best result per challenge key
	opened: Record<string, { hint?: number; solution?: number }>; // day each was opened
	offset: number; // preview control: days added to the clock
	placement: string | null; // suggested starting module
}

const empty = (): ProgressState => ({
	levels: {},
	cleanSolves: {},
	reviews: {},
	status: {},
	opened: {},
	offset: 0,
	placement: null
});

const rank: Record<ChallengeStatus, number> = { seen: 0, hinted: 1, clean: 2 };

export class TrackProgress {
	state = $state<ProgressState>(empty());
	loaded = $state(false);
	readonly skills: ReturnType<typeof skillsOf>;
	#loading: Promise<void> | null = null;

	constructor(readonly track: Track) {
		this.skills = skillsOf(track);
	}

	/** Load from IndexedDB (browser only; call from onMount). */
	load(): Promise<void> {
		this.#loading ??= db.progress.get(this.track.id).then((rec) => {
			if (rec) this.state = { ...empty(), ...(rec.data as Partial<ProgressState>) };
			this.loaded = true;
		});
		return this.#loading;
	}

	#save() {
		void db.progress.put({ trackId: this.track.id, data: $state.snapshot(this.state) });
	}

	today(): number {
		const d = new Date();
		// Local calendar day, so "a different day" means what the learner thinks it means.
		return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5) + this.state.offset;
	}

	level(skill: string | null | undefined): number {
		return (skill && this.state.levels[skill]) || 0;
	}

	raise(skill: string | null | undefined, n: number) {
		if (!skill || !this.skills.has(skill)) return;
		if (this.level(skill) < n) {
			this.state.levels[skill] = n;
			this.#save();
		}
	}

	lower(skill: string) {
		if (this.level(skill) > 0) {
			this.state.levels[skill] = this.level(skill) - 1;
			this.#save();
		}
	}

	/** Put an answered question (back) on the review schedule. */
	schedule(item: Omit<ReviewItem, 'step' | 'due'>, ok: boolean) {
		const prev = this.state.reviews[item.id];
		const step = ok ? Math.min((prev?.step ?? -1) + 1, REVIEW_DAYS.length - 1) : 0;
		this.state.reviews[item.id] = { ...item, step, due: this.today() + REVIEW_DAYS[step] };
		this.#save();
	}

	due(): ReviewItem[] {
		const t = this.today();
		return Object.values(this.state.reviews).filter((r) => r.due <= t);
	}

	upcoming(): ReviewItem[] {
		const t = this.today();
		return Object.values(this.state.reviews)
			.filter((r) => r.due > t)
			.sort((a, b) => a.due - b.due);
	}

	// ---- challenges -------------------------------------------------------

	/** Record that the hint or the solution was opened today. */
	open(key: string, what: 'hint' | 'solution') {
		this.state.opened[key] = { ...this.state.opened[key], [what]: this.today() };
		if (what === 'solution') this.#setStatus(key, 'seen');
		this.#save();
	}

	openedToday(key: string, what: 'hint' | 'solution') {
		return this.state.opened[key]?.[what] === this.today();
	}

	#setStatus(key: string, s: ChallengeStatus) {
		const prev = this.state.status[key];
		if (!prev || rank[s] > rank[prev]) this.state.status[key] = s;
	}

	/**
	 * A challenge was accepted by the grader. Returns how it counted.
	 * `reviewId` is set when the attempt was opened from the review queue.
	 */
	solved(key: string, ch: TrackChallenge, module: string, reviewId?: string): ChallengeStatus {
		const skill = ch.skill;
		let how: ChallengeStatus;
		if (this.openedToday(key, 'solution')) how = 'seen';
		else if (this.openedToday(key, 'hint')) how = 'hinted';
		else how = 'clean';
		this.#setStatus(key, how);

		if (skill && this.skills.has(skill)) {
			if (how === 'hinted') this.raise(skill, 3);
			if (how === 'clean') this.#cleanSolve(skill, ch.tier, !!reviewId);
			if (reviewId) this.#afterChallengeReview(reviewId, how);
			else if (how === 'clean' && this.level(skill) < 4) {
				// A second clean solve has to come from a review on a later day.
				const id = `ch:${skill}`;
				if (!this.state.reviews[id]) {
					this.state.reviews[id] = { id, kind: 'challenge', module, skill, step: 0, due: this.today() + 1 };
				}
			}
		}
		this.#save();
		return how;
	}

	#cleanSolve(skill: string, tier: string, review: boolean) {
		const t = this.today();
		// Re-read after assigning: `x ??= []` returns the plain array, not the reactive proxy.
		this.state.cleanSolves[skill] ??= [];
		const list = this.state.cleanSolves[skill];
		if (!list.some((c) => c.day === t && c.review === review)) list.push({ day: t, review });
		this.raise(skill, 3);
		const days = new Set(list.map((c) => c.day));
		if (days.size >= 2 && list.some((c) => c.review)) this.raise(skill, 4);
		if (this.level(skill) >= 4 && (tier === 'stretch' || tier === 'brain-melter')) this.raise(skill, 5);
	}

	#afterChallengeReview(reviewId: string, how: ChallengeStatus) {
		const r = this.state.reviews[reviewId];
		if (!r) return;
		if (how === 'clean') {
			if (this.level(r.skill) >= 4) this.schedule(r, true);
			else this.state.reviews[reviewId] = { ...r, due: this.today() + 1 };
		} else if (how === 'seen') {
			this.lower(r.skill);
			this.schedule(r, false);
		} else {
			this.state.reviews[reviewId] = { ...r, due: this.today() + 1 };
		}
	}

	/** Revealing the solution during a review counts as a missed review. */
	gaveUpReview(reviewId: string) {
		const r = this.state.reviews[reviewId];
		if (!r) return;
		this.lower(r.skill);
		this.schedule(r, false);
	}

	/** A predict-type challenge answered inline (at most level 2). */
	predicted(key: string, ch: TrackChallenge, firstTry: boolean) {
		this.#setStatus(key, firstTry ? 'clean' : 'hinted');
		this.raise(ch.skill, firstTry ? 2 : 1);
		this.#save();
	}

	// ---- placement and preview control -----------------------------------

	setPlacement(module: string) {
		this.state.placement = module;
		this.#save();
	}

	shiftClock(days: number | null) {
		this.state.offset = days === null ? 0 : this.state.offset + days;
		this.#save();
	}

	reset() {
		this.state = empty();
		this.#save();
	}

	// ---- summaries ---------------------------------------------------------

	modulePercent(moduleId: string) {
		const m = this.track.modules.find((x) => x.id === moduleId);
		if (!m) return 0;
		const sum = m.subskills.reduce((a, s) => a + this.level(s.id), 0);
		return Math.round((100 * sum) / (5 * m.subskills.length));
	}

	atLeast(n: number) {
		return [...this.skills.keys()].filter((k) => this.level(k) >= n).length;
	}
}

const cache = new Map<string, TrackProgress>();

export function progressFor(track: Track): TrackProgress {
	let p = cache.get(track.id);
	if (!p) cache.set(track.id, (p = new TrackProgress(track)));
	return p;
}
