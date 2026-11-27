// Track content: lessons, probes, animations and pipeline challenges.
//
// Source of truth is YAML in content/<track>/. `npm run content` checks it in
// webR (scripts/content/check.mjs) and writes src/lib/generated/track-*.json,
// which is bundled here at build time.

import type { SnippetOptions } from './r/engine.svelte.ts';

export interface Option {
	choice: string;
	correct?: boolean;
	misconception?: string;
	probe?: string;
}

/** A multiple-choice question whose wrong options each carry a narrower probe. */
export interface Mcq {
	id?: string;
	skill: string;
	ask: string;
	code?: string | null;
	options: Option[];
	right_followup?: string | null;
	explain?: string | null;
}

export interface DataTable {
	cols: string[];
	rows: string[][];
}

export interface AnimRow {
	k: string; // tile key (row id, or "g:<group>" after a merge)
	v: string[]; // formatted values, one per visible column
	t?: string; // tint value (e.g. the species)
	from?: string[]; // source row keys that merged into this row
	src?: (string | null)[]; // per visible column: the tile this cell came from (split/widen)
}

export interface AnimStep {
	show: string | null;
	caption: string;
	badge: string;
	cols: string[];
	ids: string[]; // stable column identities (survive renames)
	rows: AnimRow[];
	bands: boolean;
	tint: boolean;
	pour: Record<string, string> | null;
	by: string[] | null;
	merged: boolean;
	skill: string | null;
	/** A second table drawn to the right (joins): y rows keyed y1, y2, … */
	side?: { cols: string[]; ids: string[]; rows: AnimRow[] } | null;
}

export type Tier = 'warm-up' | 'core' | 'stretch' | 'brain-melter' | 'integrative';
export type ChallengeType = 'write' | 'fix' | 'constrained' | 'predict';

export interface TrackChallenge {
	id: string;
	tier: Tier;
	type: ChallengeType;
	skill: string | null;
	prompt: string;
	hint: string | null;
	solution: string | null;
	starter: string | null;
	starter_error?: string | null;
	code: string | null;
	explain: string | null;
	data: string;
	forbid: string[] | null;
	require: string[] | null;
	compare: { ignore_row_order?: boolean; ignore_column_order?: boolean; labels?: string[]; theme?: string[] } | null;
	robust: boolean | null;
	uses?: string[] | null; // other datasets the challenge needs (joins)
	plot?: boolean; // the answer is a ggplot (graded on what ggplot computes)
	dims?: string;
	expected?: string;
	options?: string[];
	answer?: string;
}

export interface Module {
	id: string;
	title: string;
	key_idea: string;
	subskills: { id: string; name: string }[];
	readings: { label: string; url: string }[];
	predict: Mcq & { show_data?: boolean; data_table?: DataTable | null };
	probes: (Mcq & { id: string })[];
	anim: AnimStep[];
	/** Plotting modules: complete ggplot code per step, drawn by R in the app. */
	plots?: { code: string; caption: string; skill: string | null }[] | null;
	challenges: TrackChallenge[];
}

/** Size and columns of a dataset, recorded by the content check. */
export interface DatasetInfo {
	rows: number;
	ncol: number;
	cols: { name: string; type: string }[]; // runs like wk1 … wk76 are one entry
}

export interface Track {
	id: string;
	number: number;
	title: string;
	summary: string;
	modules: Module[];
	diagnostic: (Mcq & { id: string; module: string })[];
	final: { questions: (Mcq & { id: string })[]; integrative: TrackChallenge };
	datasets: Record<string, DatasetInfo>;
	built: {
		at: string;
		r: string;
		runtime: string;
		dplyr: string;
		packages: Record<string, string>;
		counts: { modules: number; challenges: number; probes: number; anim_steps: number; lines: number };
	};
}

const files = import.meta.glob<Track>('/src/lib/generated/track-*.json', { import: 'default', eager: true });

export const tracks: Track[] = Object.keys(files)
	.sort()
	.map((p) => files[p]);

export const getTrack = (id: string) => tracks.find((t) => t.id === id);

export function getModule(track: Track, id: string) {
	return track.modules.find((m) => m.id === id);
}

/** Globally unique challenge key, used for drafts, attempts and progress. */
export const challengeKey = (track: Track, mod: Module | null, ch: TrackChallenge) =>
	`${track.id}/${mod ? mod.id : 'final'}/${ch.id}`;

/** Every subskill of a track, with the module it belongs to. */
export function skillsOf(track: Track) {
	const out = new Map<string, { id: string; name: string; module: string }>();
	for (const m of track.modules) for (const s of m.subskills) out.set(s.id, { ...s, module: m.id });
	return out;
}

export const shortTitle = (m: Module) => m.title.split(':')[0];

export function snippetOptions(ch: TrackChallenge): SnippetOptions {
	return {
		data: ch.data,
		ignore_row_order: ch.compare?.ignore_row_order ?? false,
		ignore_column_order: ch.compare?.ignore_column_order ?? false,
		forbid: ch.forbid ?? undefined,
		require: ch.require ?? undefined,
		robust: ch.robust === false ? false : undefined,
		labels: ch.compare?.labels ?? undefined,
		theme: ch.compare?.theme ?? undefined
	};
}

/** What the editor starts with. */
export function starterCode(ch: TrackChallenge) {
	return ch.type === 'fix' && ch.starter ? ch.starter : `${ch.data} |>\n  `;
}

/** Key under which a predict-type challenge's answer is saved (lesson page and workspace share it). */
export const answerKey = (track: Track, mod: Module | null, ch: TrackChallenge) => `${challengeKey(track, mod, ch)}#answer`;

/** A predict-type challenge as a multiple-choice question. */
export function predictQuestion(ch: TrackChallenge): Mcq {
	return {
		skill: ch.skill ?? '',
		ask: '',
		code: ch.code,
		explain: ch.explain,
		right_followup: ch.explain,
		options: (ch.options ?? []).map((o) => ({
			choice: o,
			correct: o === ch.answer,
			probe: 'Run it in your head once more, row by row.'
		}))
	};
}
