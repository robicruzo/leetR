<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/env';
	import { asset, resolve } from '$app/paths';
	import favicon from '#lib/assets/favicon.svg';
	import { engine } from '#lib/r/engine.svelte.ts';
	import type { LayoutProps } from './$types';
	import '../app.css';

	let { children }: LayoutProps = $props();

	onMount(() => {
		if (!dev && 'serviceWorker' in navigator) {
			navigator.serviceWorker.register(resolve('/') + 'service-worker.js', { type: 'module' }).then(() => {
				// The service worker adds the COOP/COEP headers. The first visit isn't
				// isolated yet, so reload once it controls the page.
				if (!crossOriginIsolated && navigator.serviceWorker.controller === null) {
					navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
				}
			});
		}
		// Warm R up in the background so it's ready by the time you've read the problem.
		engine.start().catch(() => {});
	});

	const statusLabel: Record<string, string> = {
		idle: 'R idle',
		booting: 'Starting R',
		installing: 'Loading packages',
		ready: 'R ready',
		busy: 'R busy',
		restarting: 'Restarting R',
		error: 'R failed'
	};
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href={asset('manifest.webmanifest')} />
	<meta name="theme-color" content="#1b1f27" />
</svelte:head>

<header>
	<a class="brand" href={resolve('/')}>leet<span>R</span></a>
	<span class="engine {engine.status}" title={engine.detail || (engine.crossOriginIsolated ? 'Cross-origin isolated (SharedArrayBuffer channel)' : 'Not isolated (PostMessage channel)')}>
		<span class="dot"></span>{statusLabel[engine.status]}
	</span>
</header>

<main>
	{@render children()}
</main>

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 1.25rem;
		height: 48px;
		border-bottom: 1px solid var(--border);
		background: var(--panel);
	}
	.brand {
		font-weight: 700;
		font-size: 1.15rem;
		color: var(--text);
		text-decoration: none;
		letter-spacing: -0.02em;
	}
	.brand span {
		color: var(--accent);
	}
	.engine {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--muted);
	}
	.ready .dot {
		background: var(--pass);
	}
	.busy .dot,
	.booting .dot,
	.installing .dot,
	.restarting .dot {
		background: var(--warn);
		animation: pulse 1s infinite alternate;
	}
	.error .dot {
		background: var(--fail);
	}
	@keyframes pulse {
		to {
			opacity: 0.3;
		}
	}
	main {
		height: calc(100dvh - 48px);
		overflow: auto;
	}
</style>
