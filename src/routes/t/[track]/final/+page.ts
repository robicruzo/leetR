import { error } from '@sveltejs/kit';
import { getTrack, tracks } from '#lib/tracks.ts';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => tracks.map((t) => ({ track: t.id }));

export const load: PageLoad = ({ params }) => {
	const track = getTrack(params.track);
	if (!track) error(404, 'No such track');
	return { track };
};
