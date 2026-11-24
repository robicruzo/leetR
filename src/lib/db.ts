// Local persistence (IndexedDB via Dexie): code drafts, submission history,
// and solved state. Nothing leaves the user's machine.

import Dexie, { type EntityTable } from 'dexie';

export interface Draft {
	challengeId: string;
	code: string;
	updatedAt: number;
}

export interface Attempt {
	id?: number;
	challengeId: string;
	passed: boolean;
	code: string;
	at: number;
}

/** One record per track: skill levels, reviews and challenge status (see progress.svelte.ts). */
export interface TrackProgressRecord {
	trackId: string;
	data: unknown;
}

export const db = new Dexie('leetr') as Dexie & {
	drafts: EntityTable<Draft, 'challengeId'>;
	attempts: EntityTable<Attempt, 'id'>;
	progress: EntityTable<TrackProgressRecord, 'trackId'>;
};

db.version(1).stores({
	drafts: 'challengeId',
	attempts: '++id, challengeId, at, [challengeId+passed]'
});
db.version(2).stores({
	progress: 'trackId'
});

export const getDraft = (challengeId: string) => db.drafts.get(challengeId);

export const saveDraft = (challengeId: string, code: string) =>
	db.drafts.put({ challengeId, code, updatedAt: Date.now() });

export const clearDraft = (challengeId: string) => db.drafts.delete(challengeId);

export const recordAttempt = (challengeId: string, passed: boolean, code: string) =>
	db.attempts.add({ challengeId, passed, code, at: Date.now() });

export async function solvedIds(): Promise<Set<string>> {
	const solved = await db.attempts.filter((a) => a.passed).toArray();
	return new Set(solved.map((a) => a.challengeId));
}

const dayKey = (t: number) => new Date(t).toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

/** Consecutive days (ending today or yesterday) with at least one passing submission. */
export async function streak(): Promise<number> {
	const days = new Set((await db.attempts.filter((a) => a.passed).toArray()).map((a) => dayKey(a.at)));
	const d = new Date();
	if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
	let n = 0;
	while (days.has(dayKey(d.getTime()))) {
		n++;
		d.setDate(d.getDate() - 1);
	}
	return n;
}
