# leetR

LeetCode-style R challenges graded by real R in the browser ([webR](https://docs.r-wasm.org/webr/latest/)). There is no server and no account, and it works offline as an installable PWA.

It has two kinds of content:

- **Tracks** (`content/`): lessons built on a Socratic loop, Predict → Watch → Probe → Do → Review. Each module has a prediction question, a table-morph animation built from real R output, misconception probes, and 8 pipeline challenges graded by R. Track 2, *One-table wrangling* (7 modules, 56 challenges), Track 3, *Tidy data and reshaping* (5 modules, 40 challenges), and Track 4, *Joins* (5 modules, 40 challenges, on nycflights13), are written. Skill levels and spaced review are kept in IndexedDB.
- **Practice challenges** (`src/challenges/`): write a function. It is graded against hidden cases and property tests on random inputs.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in build/ (~88 MB, nearly all of it R)
npm run preview
```

`npm run dev` and `npm run build` first run `npm run assets`, then `npm run content`.

`npm run assets`:

1. copies the webR runtime from `node_modules/webr/dist` into `static/webr/`
2. mirrors the R packages in [`r-packages.json`](r-packages.json) (`packages` for the app, `buildPackages` for the content check), plus their recursive dependencies, from `repo.r-wasm.org` into `static/webr-repo/`

`npm run content` ([`scripts/content/check.mjs`](scripts/content/check.mjs)) checks every track inside webR, using the same package files the app ships, and writes `src/lib/generated/track-*.json`. It fails the build if:

- an animation step or a solution doesn't run;
- a predict answer or a `verify` line disagrees with R;
- a fix-it starter isn't actually broken;
- the app's own grader can't tell right from wrong on a challenge.

It records package versions in [`content/packages.lock.json`](content/packages.lock.json), and skips itself when nothing changed (`-- --force` to rerun). The same checks run under native R with `Rscript scripts/content/build.R content/02-wrangling out.json`.

The generated folders (`static/webr`, `static/webr-repo` and `src/lib/generated`) are git-ignored. At runtime nothing is fetched from the internet: webR loads from `/webr/` and installs packages from `/webr-repo/`.

## How it fits together

| Piece | Where |
|---|---|
| R engine (webR in its worker, packages, timeouts, restart) | [`src/lib/r/engine.svelte.ts`](src/lib/r/engine.svelte.ts) |
| Grader: function challenges (`grade`) and track challenges (`grade_snippet`) | [`src/lib/r/grader.R`](src/lib/r/grader.R) |
| Shared R setup (packages, `penguins_sample`, `mpg`), used by the app and the content check | [`content/setup.R`](content/setup.R) |
| Track content check + JSON build | [`scripts/content/`](scripts/content/) |
| Track loader and types | [`src/lib/tracks.ts`](src/lib/tracks.ts) |
| Skill levels, spaced review, challenge status | [`src/lib/progress.svelte.ts`](src/lib/progress.svelte.ts) |
| Lesson components: question with probes, table-morph animation, skill map | [`src/lib/components/`](src/lib/components/) |
| Practice-challenge loader (Markdown + R files, bundled at build time) | [`src/lib/challenges.ts`](src/lib/challenges.ts) |
| Progress, drafts, streak (IndexedDB via Dexie) | [`src/lib/db.ts`](src/lib/db.ts) |
| Offline cache + COOP/COEP header injection | [`src/service-worker/index.ts`](src/service-worker/index.ts) |

**Cross-origin isolation.** webR's SharedArrayBuffer channel needs COOP/COEP headers. In dev and preview, a Vite middleware sends them. In production, the service worker adds them to every response. So any static host works, including GitHub Pages, where you can't set headers. The first visit reloads once when the service worker takes control.

**Infinite loops.** Run has a 15 s limit and Submit 30 s. On timeout the engine interrupts R. If R doesn't yield within 1.5 s, it kills the worker and boots a fresh session, which takes about 4–5 s with the cache warm.

**Deploying.** Every push to `main` deploys to GitHub Pages ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)): the workflow mirrors the packages, runs the content check in webR, and builds under `/<repo-name>/`, so a failing content check blocks the deploy. Live at https://robicruzo.github.io/leetR/.

To test a Pages build locally, with the sub-path and without COOP/COEP headers (so the service worker has to add them):

```bash
BASE_PATH=/leetR npm run build
npm run serve:pages   # http://localhost:4175/leetR/
```

The first visit loads once, then reloads itself when the service worker takes over. From then on the page is cross-origin isolated.

## Track challenges and grading

A track challenge is a pipeline whose last value is the answer, run on a named dataset (`penguins`, `starwars`, `storms`, `mpg`). On Submit the grader:

1. checks `forbid` / `require` on every parse token. A rule can name a function, an operator such as `|`, an argument such as `.by`, or a column name.
2. compares your result with the reference after `ungroup()`. If the challenge sets `compare: {ignore_row_order: true}`, row order is ignored.
3. runs both again on a seeded half of the dataset, so an answer typed in by hand fails. A challenge can opt out with `robust: false`.

The content check runs the same grader on every challenge at build time.

Writing a module: copy a folder in `content/02-wrangling/` and edit `module.yml`, `anim.yml` and `challenges.yml`. CLAUDE.md §5 describes the format.

## Writing a practice challenge

One folder per challenge in `src/challenges/`. The folder name sets the sort order.

```
src/challenges/001-dept-summary/
  challenge.md   # frontmatter + prompt, then "## Hints" (### per hint) and "## Explanation"
  starter.R      # what the editor starts with
  solution.R     # reference solution, defines the same function
  tests.R        # cases + optional property-test generator
```

`challenge.md` frontmatter:

```yaml
id: dept-summary            # URL: /c/dept-summary/
title: Department payroll summary
difficulty: easy            # easy | medium | hard
track: The tidyverse
tags: [dplyr, summarise]
function: dept_summary      # the function the user must define
compare:
  row_order: strict         # or: ignore (rows are sorted before comparing)
  column_order: strict      # or: ignore
  tolerance: 1.0e-8         # numeric tolerance (waldo)
  ignore_attr: false        # or true, or a list of attribute names
  strict_nan: true          # NaN vs NA counts as a difference (default)
rules:
  no_loops: true            # bans for/while/repeat, and eval/parse-style escape hatches
  must_call: [across]       # must appear as a function call
  forbid_call: [sapply]
```

`tests.R`:

```r
cases <- list(
  list(name = "Example", args = list(staff = example)),               # visible: diff + input shown
  list(name = "All NA",  args = list(staff = all_na), hidden = TRUE)  # hidden: pass/fail only
)
n_random <- 25
generate <- function(i) list(staff = random_staff())  # seeded with set.seed(i)
```

On each case the grader calls both the user's function and the reference, then compares the results with `waldo::compare()`. Random inputs are summarised as one line, showing the first failure.

## Known gaps / next steps

- Tracks 2, 3 and 4 are written. CLAUDE.md §4 has the curriculum and §7 the next steps.
- `yaml` and `jsonlite` are mirrored for the content check, so the app also precaches them (about 1 MB it never uses).
- The soft interrupt didn't stop a bare `repeat {}` in testing, so the worker-restart fallback is what actually ends runaway loops.
- `grader.R` runs in the same R session as user code. A determined user can tamper with `.leetr`. That's fine for practice, but don't use it for anything high-stakes.
