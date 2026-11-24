<script lang="ts">
	import TrackWorkspace from '#lib/components/TrackWorkspace.svelte';
	import { challengeKey } from '#lib/tracks.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const key = $derived(challengeKey(data.track, data.mod, data.challenge));
</script>

<!-- Keyed, so moving between challenges starts a fresh workspace (code, verdict, editor). -->
{#key key}
	<TrackWorkspace track={data.track} mod={data.mod} ch={data.challenge} />
{/key}
