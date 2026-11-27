// The R engine: one webR instance, which runs R inside its own Web Worker so
// the UI never blocks. Responsibilities:
//   - boot webR from our own origin (/webr/) and install packages from our own
//     mirror (/webr-repo/), so nothing is fetched from the internet at runtime
//   - load the grader (grader.R) into the R session
//   - run user code with a timeout; on timeout, interrupt R, and if R doesn't
//     yield, kill the worker and boot a fresh one (stops `repeat {}`)

import { resolve } from '$app/paths';
import type { WebR as WebRType } from 'webr';
import graderSource from './grader.R?raw';
// Shared with the content check, so the app sees the same data (penguins_sample, mpg).
import setupSource from '../../../content/setup.R?raw';
import { toPlain } from './convert.ts';
import packageConfig from '../../../r-packages.json';

export type EngineStatus = 'idle' | 'booting' | 'installing' | 'ready' | 'busy' | 'restarting' | 'error';

export interface OutputLine {
	type: 'stdout' | 'stderr' | 'message' | 'warning' | 'error';
	text: string;
}

export interface RunResult {
	output: OutputLine[];
	images: ImageBitmap[];
	timedOut: boolean;
}

export interface CaseResult {
	name: string;
	hidden: boolean;
	status: 'pass' | 'fail' | 'error';
	detail: string;
	input: string;
}

export interface GradeResult {
	passed: boolean;
	structure: string[];
	cases: CaseResult[];
	error: string | null;
	timedOut: boolean;
	ms: number;
}

export interface GradeOptions {
	fn_name: string;
	row_order?: 'strict' | 'ignore';
	column_order?: 'strict' | 'ignore';
	tolerance?: number;
	ignore_attr?: boolean | string[];
	strict_nan?: boolean;
	no_loops?: boolean;
	must_call?: string[];
	forbid_call?: string[];
}

/** Options for a track ("snippet") challenge: a pipeline run on a named dataset. */
export interface SnippetOptions {
	data: string;
	ignore_row_order?: boolean;
	ignore_column_order?: boolean;
	forbid?: string[];
	require?: string[];
	robust?: boolean;
}

class TimeoutError extends Error {}

// Grading captures R's conditions, like Run does, and never throws from R:
// #fromCapture() reads an R error out of the captured output instead. (With
// captureConditions: false, webR threw an exception with an empty message on
// some results, e.g. any graded value containing a Date.)
const GRADE_CAPTURE = {
	captureStreams: true,
	captureConditions: true,
	captureGraphics: { width: 640, height: 400 },
	throwJsException: false
};

// R's default graphics device (pdf) throws inside webR. captureR() restores the
// previous device afterwards, which opens that default if nothing was open, so
// keep a throwaway canvas "parked" as the current device at all times, and make
// any device R opens on its own a canvas too (e.g. plot() during grading).
const PARK_DEVICE = `
	options(device = function(...) webr::canvas(width = 640, height = 400, capture = TRUE))
	# Start each job from a clean slate: drop stray devices and cached plots.
	graphics.off()
	webr::canvas_destroy(webr::canvas_cache())
	webr::canvas(width = 640, height = 400, capture = TRUE)
	invisible(NULL)
`;

class REngine {
	status = $state<EngineStatus>('idle');
	detail = $state('');
	crossOriginIsolated = $state(false);

	#webR: WebRType | null = null;
	#booting: Promise<WebRType> | null = null;
	#queue: Promise<unknown> = Promise.resolve();

	/** Start webR (idempotent). Resolves when R is ready to grade. */
	start(): Promise<WebRType> {
		this.#booting ??= this.#boot().catch((err) => {
			this.status = 'error';
			this.detail = String(err?.message ?? err);
			this.#booting = null;
			throw err;
		});
		return this.#booting;
	}

	async #boot(): Promise<WebRType> {
		this.status = this.status === 'restarting' ? 'restarting' : 'booting';
		this.crossOriginIsolated = globalThis.crossOriginIsolated ?? false;
		this.detail = 'Starting R…';
		const { WebR } = await import('webr');
		// Absolute URL of the app root, e.g. https://host/repo (no trailing slash).
		const origin = new URL(resolve('/'), location.href).href.replace(/\/$/, '');
		const webR = new WebR({
			baseUrl: `${origin}/webr/`,
			repoUrl: `${origin}/webr-repo/`,
			interactive: false
		});
		await webR.init();

		this.status = 'installing';
		this.detail = 'Loading packages…';
		await webR.installPackages(packageConfig.packages, {
			repos: [`${origin}/webr-repo/`],
			quiet: true,
			mount: true
		});
		await webR.evalRVoid(`
			options(cli.num_colors = 1, crayon.enabled = FALSE, width = 80,
			        warn = 1, pillar.advice = FALSE, lifecycle_verbosity = "quiet")
			suppressPackageStartupMessages({
				library(dplyr); library(tidyr); library(purrr); library(stringr)
				# (content/setup.R attaches the rest: forcats, lubridate, readr, janitor, …)
			})
			invisible(loadNamespace("waldo"))
		`);
		await webR.evalRVoid(setupSource);
		await webR.evalRVoid(graderSource);
		await this.#warmUpTimeZones(webR);
		await webR.evalRVoid(PARK_DEVICE);

		this.#webR = webR;
		this.status = 'ready';
		this.detail = '';
		return webR;
	}

	/**
	 * In the browser, webR fetches R's time-zone files lazily, and the first
	 * one or two date operations of a session (even as.Date("2026-01-02"))
	 * fail below R's error handling, so not even tryCatch() sees them. Under
	 * Node the files are on disk and this never happens. Touch dates, date-times
	 * and a real time zone here, retrying, so learner code is never first.
	 */
	async #warmUpTimeZones(webR: WebRType) {
		this.detail = 'Loading time zones…';
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				await webR.evalRVoid(`invisible(list(
					as.Date("2026-01-02"),
					format(as.POSIXct("2026-03-08 12:00:00", tz = "America/New_York"), tz = "UTC"),
					lubridate::ymd_hms("2026-03-07 12:00:00", tz = "America/New_York") + lubridate::ddays(1)
				))`);
				return;
			} catch {
				// Expected on the first attempts; the files are loaded by now or soon.
			}
		}
	}

	/** Kill the worker and boot a fresh R session. */
	async restart(): Promise<void> {
		this.status = 'restarting';
		this.detail = 'Restarting R…';
		try {
			this.#webR?.close();
		} catch {
			/* already dead */
		}
		this.#webR = null;
		this.#booting = null;
		this.#queue = Promise.resolve();
		await this.start();
	}

	/** Serialise jobs (R is single-threaded) and enforce a wall-clock timeout. */
	#job<T>(label: string, timeoutMs: number, fn: (webR: WebRType) => Promise<T>): Promise<T> {
		const run = async () => {
			const webR = await this.start();
			this.status = 'busy';
			this.detail = label;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const timeout = new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new TimeoutError()), timeoutMs);
			});
			const work = fn(webR);
			try {
				return await Promise.race([work, timeout]);
			} catch (err) {
				if (err instanceof TimeoutError) {
					// Ask R nicely first; the interrupt works on the SharedArrayBuffer channel.
					webR.interrupt();
					const yielded = await Promise.race([
						work.then(() => true, () => true),
						new Promise<boolean>((r) => setTimeout(() => r(false), 1500))
					]);
					if (!yielded) void this.restart();
				}
				throw err;
			} finally {
				clearTimeout(timer);
				if (this.status === 'busy') {
					this.status = 'ready';
					this.detail = '';
				}
			}
		};
		const p = this.#queue.then(run, run);
		this.#queue = p.catch(() => {});
		return p;
	}

	async #bind(webR: WebRType, values: Record<string, unknown>) {
		for (const [name, value] of Object.entries(values)) {
			await webR.objs.globalEnv.bind(name, value as never);
		}
	}

	/** "Run": execute the user's code on the visible examples, capturing output and plots. */
	run(userCode: string, testsCode: string, fnName: string, timeoutMs = 15_000): Promise<RunResult> {
		return this.#capture(
			{ '.leetr_user': userCode, '.leetr_tests': testsCode, '.leetr_fn': fnName },
			'.leetr$run_examples(.leetr_user, .leetr_tests, .leetr_fn)',
			timeoutMs
		);
	}

	/** "Run" for a track challenge: evaluate the code like the console, printing visible values. */
	runSnippet(userCode: string, timeoutMs = 15_000): Promise<RunResult> {
		return this.#capture({ '.leetr_user': userCode }, '.leetr$run_snippet(.leetr_user)', timeoutMs);
	}

	async #capture(values: Record<string, string>, call: string, timeoutMs: number): Promise<RunResult> {
		try {
			return await this.#job('Running…', timeoutMs, async (webR) => {
				await this.#bind(webR, values);
				await webR.evalRVoid(PARK_DEVICE);
				const shelter = await new webR.Shelter();
				try {
					const res = await shelter.captureR(
						call,
						{
							captureStreams: true,
							captureConditions: true,
							captureGraphics: { width: 640, height: 400 },
							throwJsException: false
						}
					);
					const output: OutputLine[] = [];
					for (const o of res.output) {
						if (o.type === 'stdout' || o.type === 'stderr') {
							output.push({ type: o.type, text: o.data });
						} else if (o.type === 'message' || o.type === 'warning' || o.type === 'error') {
							const msg = await (o.data as { toJs: () => Promise<unknown> }).toJs();
							const text = String((toPlain(msg) as { message?: string })?.message ?? '').replace(/\n$/, '');
							output.push({ type: o.type, text });
						}
					}
					return { output, images: res.images, timedOut: false };
				} finally {
					await shelter.purge();
				}
			});
		} catch (err) {
			if (err instanceof TimeoutError) {
				return {
					output: [{ type: 'error', text: `Stopped after ${timeoutMs / 1000}s: is there an infinite loop?` }],
					images: [],
					timedOut: true
				};
			}
			return { output: [{ type: 'error', text: String((err as Error)?.message ?? err) }], images: [], timedOut: false };
		}
	}

	/** "Submit": run structural checks, fixed cases and property tests in R. */
	async grade(
		userCode: string,
		solutionCode: string,
		testsCode: string,
		opts: GradeOptions,
		timeoutMs = 30_000
	): Promise<GradeResult> {
		const t0 = performance.now();
		try {
			return await this.#job('Grading…', timeoutMs, async (webR) => {
				// Drop empty arrays/undefined: JS [] has no R type.
				const cleanOpts = Object.fromEntries(
					Object.entries(opts).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))
				);
				await this.#bind(webR, {
					'.leetr_user': userCode,
					'.leetr_solution': solutionCode,
					'.leetr_tests': testsCode
				});
				const optsList = await new webR.RList(cleanOpts as never);
				await webR.objs.globalEnv.bind('.leetr_opts', optsList);
				await webR.evalRVoid(PARK_DEVICE);
				const shelter = await new webR.Shelter();
				try {
					const captured = await shelter.captureR(
						'.leetr$grade(.leetr_user, .leetr_solution, .leetr_tests, .leetr_opts)',
						GRADE_CAPTURE
					);
					return await this.#fromCapture(captured, t0);
				} finally {
					await shelter.purge();
					await webR.destroy(optsList);
				}
			});
		} catch (err) {
			return this.#gradeError(err, timeoutMs, t0);
		}
	}

	/** "Submit" for a track challenge: rules, comparison with the solution, and a re-run on a data sample. */
	async gradeSnippet(userCode: string, solutionCode: string, opts: SnippetOptions, timeoutMs = 30_000): Promise<GradeResult> {
		const t0 = performance.now();
		try {
			return await this.#job('Grading…', timeoutMs, async (webR) => {
				const cleanOpts = Object.fromEntries(
					Object.entries(opts).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length))
				);
				await this.#bind(webR, { '.leetr_user': userCode, '.leetr_solution': solutionCode });
				const optsList = await new webR.RList(cleanOpts as never);
				await webR.objs.globalEnv.bind('.leetr_opts', optsList);
				await webR.evalRVoid(PARK_DEVICE);
				const shelter = await new webR.Shelter();
				try {
					const captured = await shelter.captureR(
						'.leetr$grade_snippet(.leetr_user, .leetr_solution, .leetr_opts)',
						GRADE_CAPTURE
					);
					return await this.#fromCapture(captured, t0);
				} finally {
					await shelter.purge();
					await webR.destroy(optsList);
				}
			});
		} catch (err) {
			return this.#gradeError(err, timeoutMs, t0);
		}
	}

	/**
	 * Read the grader's result. If R stopped instead (an error inside the
	 * grader itself), report R's own error message rather than an empty verdict.
	 */
	async #fromCapture(
		captured: { result: { toJs: () => Promise<unknown> }; output: { type: string; data: unknown }[] },
		t0: number
	): Promise<GradeResult> {
		let r: unknown = null;
		try {
			r = toPlain(await captured.result.toJs());
		} catch {
			// The value isn't the grader's list (R stopped): fall through to the errors.
		}
		if (r && typeof r === 'object' && !Array.isArray(r) && 'passed' in r) {
			return this.#toGrade(r as Record<string, unknown>, t0);
		}
		for (const o of captured.output) {
			if (o.type !== 'error') continue;
			// Ask R for the message: the condition object itself holds an R call,
			// which webR cannot convert to JavaScript.
			let message = 'no message';
			try {
				const cond = o.data as { _webRObject?: unknown };
				message = await this.#conditionMessage(cond);
			} catch {
				/* keep the fallback */
			}
			throw new Error(`The grader stopped with an R error: ${message}. Try Restart R, then Submit again.`);
		}
		throw new Error('The grader returned nothing. Try Restart R, then Submit again.');
	}

	async #conditionMessage(cond: unknown): Promise<string> {
		const webR = await this.start();
		const fn = (await webR.evalR('function(c) conditionMessage(c)')) as unknown as {
			exec: (c: unknown) => Promise<{ toJs: () => Promise<unknown> }>;
		};
		const msg = await fn.exec(cond);
		return String(toPlain(await msg.toJs()) ?? 'no message');
	}

	#toGrade(r: Record<string, unknown>, t0: number): GradeResult {
		return {
			passed: Boolean(r.passed),
			structure: (r.structure as string[]) ?? [],
			cases: ((r.cases as CaseResult[]) ?? []).map((c) => ({ ...c, hidden: Boolean(c.hidden) })),
			error: (r.error as string) ?? null,
			timedOut: false,
			ms: performance.now() - t0
		};
	}

	#gradeError(err: unknown, timeoutMs: number, t0: number): GradeResult {
		const timedOut = err instanceof TimeoutError;
		if (!timedOut) console.error('leetR: grading failed', err);
		return {
			passed: false,
			structure: [],
			cases: [],
			error: timedOut
				? `Grading stopped after ${timeoutMs / 1000}s. Does your code loop forever?`
				: String((err as Error)?.message || err || 'Grading failed with no message. Try Restart R, then Submit again.'),
			timedOut,
			ms: performance.now() - t0
		};
	}
}

export const engine = new REngine();
