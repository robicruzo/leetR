// Challenge content loader. Each challenge is a folder in src/challenges/:
//
//   challenge.md   YAML frontmatter + problem text, then `## Hints` (one
//                  `### ` subsection per hint) and `## Explanation`
//   starter.R      code the editor starts with
//   solution.R     reference solution (defines the same function)
//   tests.R        `cases` (fixed inputs, optionally hidden) and optional
//                  `generate(i)` + `n_random` for property tests
//
// Everything is bundled at build time with import.meta.glob, so challenges
// work offline and are versioned with git like any other source file.

import { marked } from 'marked';
import { parse as parseYaml } from 'yaml';
import type { GradeOptions } from './r/engine.svelte.ts';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Challenge {
	id: string;
	slug: string;
	title: string;
	difficulty: Difficulty;
	track: string;
	tags: string[];
	fnName: string;
	promptHtml: string;
	hints: { title: string; html: string }[];
	explanationHtml: string;
	starter: string;
	solution: string;
	tests: string;
	gradeOptions: GradeOptions;
}

interface Frontmatter {
	id?: string;
	title: string;
	difficulty?: Difficulty;
	track?: string;
	tags?: string[];
	function: string;
	compare?: {
		row_order?: 'strict' | 'ignore';
		column_order?: 'strict' | 'ignore';
		tolerance?: number;
		ignore_attr?: boolean | string[];
		strict_nan?: boolean;
	};
	rules?: { no_loops?: boolean; must_call?: string[]; forbid_call?: string[] };
}

const raw = (glob: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(glob).map(([p, v]) => [p.split('/').at(-2)!, v as string])
	);

const mds = raw(import.meta.glob('/src/challenges/*/challenge.md', { query: '?raw', import: 'default', eager: true }));
const starters = raw(import.meta.glob('/src/challenges/*/starter.R', { query: '?raw', import: 'default', eager: true }));
const solutions = raw(import.meta.glob('/src/challenges/*/solution.R', { query: '?raw', import: 'default', eager: true }));
const testFiles = raw(import.meta.glob('/src/challenges/*/tests.R', { query: '?raw', import: 'default', eager: true }));

function splitFrontmatter(src: string): [Frontmatter, string] {
	const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!m) throw new Error('challenge.md is missing YAML frontmatter');
	return [parseYaml(m[1]) as Frontmatter, m[2]];
}

/** Split markdown into top-level `## ` sections. The part before the first one is the prompt. */
function sections(body: string): { prompt: string; named: Map<string, string> } {
	const parts = body.split(/^## +(.+)$/m);
	const named = new Map<string, string>();
	for (let i = 1; i < parts.length; i += 2) named.set(parts[i].trim().toLowerCase(), parts[i + 1].trim());
	return { prompt: parts[0].trim(), named };
}

function parseHints(md: string | undefined) {
	if (!md) return [];
	return md
		.split(/^### +/m)
		.filter((s) => s.trim())
		.map((s) => {
			const [title, ...rest] = s.split('\n');
			return { title: title.trim(), html: marked.parse(rest.join('\n').trim(), { async: false }) };
		});
}

function load(slug: string): Challenge {
	const [fm, body] = splitFrontmatter(mds[slug]);
	for (const [file, map] of [['starter.R', starters], ['solution.R', solutions], ['tests.R', testFiles]] as const) {
		if (map[slug] === undefined) throw new Error(`Challenge ${slug} is missing ${file}`);
	}
	if (!fm.function) throw new Error(`Challenge ${slug}: frontmatter needs \`function:\``);
	const { prompt, named } = sections(body);
	return {
		id: fm.id ?? slug,
		slug,
		title: fm.title,
		difficulty: fm.difficulty ?? 'easy',
		track: fm.track ?? 'General',
		tags: fm.tags ?? [],
		fnName: fm.function,
		promptHtml: marked.parse(prompt, { async: false }),
		hints: parseHints(named.get('hints')),
		explanationHtml: marked.parse(named.get('explanation') ?? '', { async: false }),
		starter: starters[slug],
		solution: solutions[slug],
		tests: testFiles[slug],
		gradeOptions: {
			fn_name: fm.function,
			...fm.compare,
			no_loops: fm.rules?.no_loops,
			must_call: fm.rules?.must_call,
			forbid_call: fm.rules?.forbid_call
		}
	};
}

export const challenges: Challenge[] = Object.keys(mds).sort().map(load);

export const getChallenge = (id: string) => challenges.find((c) => c.id === id);
