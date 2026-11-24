import { error } from '@sveltejs/kit';
import { getModule, getTrack, tracks } from '#lib/tracks.ts';
import type { EntryGenerator, PageLoad } from './$types';

// Every challenge gets a workspace page (predict-type ones in predict mode).
// The final assessment's integrative problem lives under the pseudo-module "final".
export const entries: EntryGenerator = () =>
	tracks.flatMap((t) => [
		...t.modules.flatMap((m) =>
			m.challenges.map((c) => ({ track: t.id, module: m.id, challenge: c.id }))
		),
		{ track: t.id, module: 'final', challenge: t.final.integrative.id }
	]);

export const load: PageLoad = ({ params }) => {
	const track = getTrack(params.track);
	if (!track) error(404, 'No such track');
	if (params.module === 'final') {
		if (params.challenge !== track.final.integrative.id) error(404, 'No such challenge');
		return { track, mod: null, challenge: track.final.integrative };
	}
	const mod = getModule(track, params.module);
	const challenge = mod?.challenges.find((c) => c.id === params.challenge);
	if (!mod || !challenge) error(404, 'No such challenge');
	return { track, mod, challenge };
};
