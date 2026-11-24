import { error } from '@sveltejs/kit';
import { getModule, getTrack, tracks } from '#lib/tracks.ts';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () =>
	tracks.flatMap((t) => t.modules.map((m) => ({ track: t.id, module: m.id })));

export const load: PageLoad = ({ params }) => {
	const track = getTrack(params.track);
	const mod = track && getModule(track, params.module);
	if (!track || !mod) error(404, 'No such module');
	return { track, mod };
};
