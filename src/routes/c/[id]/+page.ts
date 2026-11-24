import { error } from '@sveltejs/kit';
import { challenges, getChallenge } from '#lib/challenges.ts';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => challenges.map((c) => ({ id: c.id }));

export const load: PageLoad = ({ params }) => {
	const challenge = getChallenge(params.id);
	if (!challenge) error(404, 'No such challenge');
	return { challenge };
};
