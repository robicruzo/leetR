# CLAUDE.md: Offline R learning app ("LeetCode for the tidyverse")

This file hands the project over from a claude.ai chat (Nov 23–24, 2026) to
Claude Code. It records everything decided so far, how the code works, what is
verified, what is not, and what to do next. Read it fully before changing
anything.

---

## 0. What is in this repo (added by Claude Code, 2026-11-24)

The repo is **one SvelteKit app, leetR** (static adapter, Svelte 5, CodeMirror 6,
Dexie, PWA service worker, webR 0.6.1). Track 2 was folded into it on
2026-11-24. It has two kinds of content:

- **Tracks** (`content/<NN-name>/`, YAML): the full lesson loop of section 3,
  with pipeline challenges graded by webR. Routes: `/t/<track>/`,
  `/placement/`, `/m/<module>/` (lesson), `/m/<module>/c/<challenge>/`
  (editor), `/review/`, `/final/`.
- **Practice challenges** (`src/challenges/`, Markdown + R files): write a
  function, graded by hidden cases + property tests on random inputs (`/c/<id>/`).
  Kept for later tracks such as Programming.

The chat version (`track2/`, from `r-app-track2.zip`, with its plain-JS
prototype player) was deleted after the port. The published player
(section 9) still shows what it looked like. See `README.md` for how everything
fits together.

---

## 1. Working on this project

- **Verify every R claim by running it.** Every number, output and answer in
  this project has been checked in R; keep it that way.
- Explain the mechanism underneath, not only the recipe. Prefer plain,
  precise wording and define jargon when it first appears.
- Personal notes about the learner this app is built for, and links to the
  private design docs from the original chat, are in `CLAUDE.local.md`
  (git-ignored; it exists only on the author's machine).
- "primer" in the readings is a companion Quarto book written for the
  course (not in this repo). Chapters: 01 R/RStudio/Quarto, 02 data basics,
  03 import, 04 ggplot grammar, 05 viz types, 06 dplyr, 07 joins,
  08 pivoting and proportions, 09 cleaning, 10 strings and dates,
  11 statistical programming, 12–14 Python/pandas, appendix A reference,
  appendix B gotchas. Its `data/` folder has course datasets (e.g.
  `sales/customers.csv`, `edibnb-badnames.csv`, `cat-lovers.csv`,
  `ucbadmit.csv`).

---

## 2. What the app is

An **offline web application for learning R**, as expansive as possible:
concepts, worked examples and a large bank of challenges that "stretch your
brain with good R juice". Think LeetCode for the tidyverse, but built on a
**Socratic teaching method** with **animations and diagrams** that show what
functions actually do (pivoting and `summarise()` are the motivating cases).

### Stack (decided)

| Layer | Choice | Why |
|---|---|---|
| Run R | **webR 0.6.x** (R 4.6.0 compiled to WebAssembly) | The only real way to run R in a browser; no server, so offline works |
| Frontend | **SvelteKit** (static adapter); Astro was the alternative | Fully static output. Already scaffolded at the repo root |
| Editor | CodeMirror 6 | Lighter than Monaco, R highlighting |
| Content | YAML files, one folder per module (section 5) | Versioned in git, checked by the build |
| Progress | IndexedDB (via Dexie) | Local only |
| Offline | PWA: manifest + one service worker | The same service worker must inject COOP/COEP headers so webR can use SharedArrayBuffer |
| Execution | webR in a Web Worker | Keeps the UI responsive; kill and restart the worker to stop infinite loops |

Costs: the first load is heavy (R + tidyverse is tens of MB), then cached;
code runs slower than native R. Alternatives considered: **Quarto Live**
(fastest way to prototype content, weak on app features) and **Tauri with
native R** (full CRAN but needs R installed).

---

## 3. Teaching method

Adapted from the user's **socratic-tutor** skill, applied to every module.

**The lesson loop:** 1 Predict → 2 Watch → 3 Probe → 4 Do → 5 Spaced review.
- **Predict:** the learner commits to an answer before seeing anything; the
  animation is locked until they do.
- **Watch:** an animation steps through what the function does.
- **Probe:** questions that expose a misconception. Wrong answer → a narrower
  question aimed at that misconception. After 3 misses, explain in 2–3
  sentences and re-test from a new angle. A correct answer sometimes gets a
  devil's-advocate follow-up ("Are you sure? What about NA?").
- **Do:** graded challenges in webR.
- **Spaced review:** items return after 1, 3, 7, 21 days, unannounced.
- A first visit to a track starts with a 3–5 question placement diagnostic.
  A "Just tell me" button skips the questioning for one item.

**Offline Socratic dialogue.** There is no language model in the app, so every
exchange is written in advance as a **misconception tree**: each wrong option
names one misconception and carries a narrower `probe` question. A good
distractor is a belief real learners hold, never a random wrong answer.

**Skill map, levels 0–5 per subskill** (each module has 3–6 subskills):

| Level | Meaning | Earned by |
|---|---|---|
| 0 | Unaware | Start |
| 1 | Heard of it | Partly right diagnostic answer, or animation watched once |
| 2 | Can follow along | Correct prediction or probe |
| 3 | Can do with help | Challenge solved with a hint |
| 4 | Independent | Two clean solves (no hint), on different days, one as a review |
| 5 | Can teach it | On top of 4: a stretch or brain-melter solved cleanly (the doc also asks for a find-the-flaw item and an explain-back) |

A failed review drops the subskill one level. A track is complete when every
subskill is at 4; it ends with a mixed final assessment (one question per
module plus an integrative problem). Levels are earned, never given; be strict.

**Challenge types:** predict the output, predict the shape, write it, fix the
bug, find the flaw, constrained (rules like "no loops", checked with
`getParseData()`), reproduce a table or plot (compare `ggplot_build()`
layers, not pixels), explain back (self-graded with a rubric).
**Tiers per module (8 challenges):** 2 warm-up, 3 core, 2 stretch,
1 brain-melter.

**Grader design (for the real app):** run the learner's code and the reference
solution in webR; compare with `waldo::compare()` / `testthat::expect_equal()`
after `ungroup()` (optionally ignoring row order); property tests on random
tibbles (NAs, empty groups, odd factor levels); constraints via parse data.
(The root app's `src/lib/r/grader.R` already does most of this.)

**Visual vocabulary (8 kinds, reused everywhere).** Animations are driven by
real R output: the build runs the code, captures each intermediate table, and
the engine moves tiles between states keyed by row id.

| Visual | Used for |
|---|---|
| Table morph (tidyexplain style) | filter, arrange, mutate, group_by + summarise, count, pivots, separate |
| Key matcher | joins, duplicate keys, many-to-many |
| Vector strip | vectorization, recycling, logical subsetting, NA propagation, `[` vs `[[` |
| Pipeline stepper | long pipelines, where grouping persists |
| Binding diagram (Advanced R style) | copy-on-modify, `<-` |
| Environment frames | scoping, closures, function factories, `<<-` |
| Layer stack | ggplot layers, aes vs constants, scales, facets |
| Sampling machine | simulation, sampling distributions, bootstrap |

Planned ninth: a **timeline ruler** for lubridate (periods vs durations).

---

## 4. Curriculum: 10 tracks, 52 modules

| # | Track | Modules | Needs | Readings |
|---|---|---|---|---|
| 1 | R foundations | atomic vectors and types · coercion · vectorization and recycling · logical operators and NA · subsetting `[` `[[` `$` · lists | – | Adv R 3–4, r4ds 12, 27, primer 2 |
| 2 | One-table wrangling (**built**) | filter · arrange + slice_* · select + rename · mutate + if_else + case_when · summarise · group_by + summarise · across | 1 | r4ds 3, MDSR 4, primer 6 |
| 3 | Tidy data and reshaping (**built**) | what makes data tidy · pivot_longer · pivot_wider · separate_wider_* and unite · explicit vs implicit missing | 2 | r4ds 5, 18, MDSR 6, primer 8 |
| 4 | Joins (**built**) | keys · mutating joins · filtering joins · duplicate keys, many-to-many · join_by inequality/rolling | 2 | r4ds 19, MDSR 5, primer 7 |
| 5 | Real-world data types | import + cleaning (readr, janitor) · counts and proportions (marginal/joint/conditional) · stringr · regex · forcats · lubridate | 2 | r4ds 7, 14–17, primer 8–10 |
| 6 | Visualization | aes vs constants · geoms and stats · positions (counts vs proportions) · scales and coords · facets · labels/themes/annotations | 2 | r4ds 1, 9–11, MDSR 2–3, primer 4–5 |
| 7 | Programming | functions · conditionals · for loops + preallocation · map family · tidy eval `{{ }}` `.data` · errors/warnings/stopifnot | 2 | r4ds 25–26, MDSR 7, Adv R 8, primer 11 |
| 8 | R internals | names/values, copy-on-modify · environments, scoping · closures, function factories · lazy evaluation · S3 | 7 | Adv R 2, 6–7, 10, 13 |
| 9 | Statistics with R | d/p/q/r · simulation · bootstrap · lm() | 6, 7 | MDSR 9, 13, App. E, primer 11 |
| 10 | Capstones | Berkeley admissions + Simpson's paradox · NYC flights investigation | 1–6 | primer 6–8, r4ds 19 |

Books: r4ds 2e https://r4ds.hadley.nz/, MDSR 3e
https://mdsr-book.github.io/mdsr3e/, Advanced R 2e https://adv-r.hadley.nz/.

**Planned additions (agreed in principle, not written):**
- **lubridate** becomes its own short track (4–5 modules): parsing
  (`mdy("01/02/2026")` vs `dmy(...)`; text dates sort alphabetically) ·
  components and rounding (`floor_date()` week start) · periods vs durations
  (NYC DST starts 2026-03-08: `+ days(1)` vs `+ ddays(1)` from 01:30 the day
  before; `ymd("2026-01-31") + months(1)` is `NA`, `%m+%` rolls back) · time
  zones (`with_tz()` vs `force_tz()`). Needs the timeline-ruler visual.
  Data: `storms` + `make_datetime()`; verify each example in webR.
- **janitor** inside Track 5: `clean_names()` (header morph), `tabyl()` +
  `adorn_*()` (order matters: `adorn_pct_formatting()` makes text, so it goes
  after `adorn_percentages()`), `get_dupes()`, `remove_empty()`,
  `excel_numeric_to_date()` (bridge to lubridate). Data: primer's
  `edibnb-badnames.csv`, `cat-lovers.csv`.
- **broom** in Track 9. skimr only as a challenge, not a module.
- Rule: a package earns modules when it brings a new, misconception-rich idea;
  convenience functions appear inside challenges.
- Estimated cost: ~200 YAML lines per module; lubridate + janitor add ~1,400
  lines and take the curriculum from 52 to ~59 modules.

---

## 5. The code (tracks)

```
content/
  setup.R                   # packages + penguins_sample + mpg; sourced by build.R AND the app engine
  packages.lock.json        # versions the content was last checked against (committed)
  02-wrangling/
    track.yml               # module order, placement diagnostic (5 Qs), final assessment (7 Qs + integrative)
    01-filter/ ... 07-across/
      module.yml            # id, title, key_idea, subskills, readings, predict, probes (2)
      anim.yml              # animation script
      challenges.yml        # exactly 8 challenges
scripts/content/
  check.mjs                 # `npm run content`: serves static/webr-repo locally, installs from it in
                            #   webR (Node), runs build.R + selftest.R per track, writes
                            #   src/lib/generated/track-<dir>.json (git-ignored); skips if inputs unchanged
  build.R                   # all content checks (section below); also runs under native R
  selftest.R                # grades every challenge with src/lib/r/grader.R (see below)
src/lib/
  tracks.ts                 # loads the generated JSON; TS types; snippetOptions(), starterCode()
  progress.svelte.ts        # levels, clean solves, reviews, challenge status (one Dexie record per track)
  r/grader.R                # .leetr$grade (functions) and .leetr$grade_snippet / run_snippet (tracks)
  r/engine.svelte.ts        # webR worker; run/grade (functions), runSnippet/gradeSnippet (tracks)
  components/               # Mcq, TableMorph, SkillMap, DataTable, TrackNav, OutputPanel, Editor
src/routes/t/[track]/...    # track home, placement, lesson, editor workspace, review, final
```

`npm run dev` / `npm run build` run `assets` then `content` first. Packages:
`r-packages.json` has `packages` (app runtime) and `buildPackages` (content
check only); `scripts/fetch-assets.mjs` mirrors both from repo.r-wasm.org.

**Grading a track challenge** (`.leetr$grade_snippet`):
1. `forbid`/`require` on all terminal parse tokens (same rule as build.R).
2. Evaluate learner code and solution in fresh envs (parent = global, where
   `setup.R` ran), with `set.seed(1)`. The last value is the answer.
3. `ungroup()` → `as_tibble()` → optional row sort → `waldo::compare()`.
   Tables over 2,000 rows skip waldo's full diff, which took minutes on two
   300,000-row tables of different lengths: the grader reports a row-count
   mismatch in one line, column differences via the zero-row prototypes, and
   otherwise finds differing rows itself and lets waldo show the first 10.
4. Re-run both on a seeded **half** sample of the dataset (bound to the same
   name), so a typed-in answer fails. Opt out per challenge with `robust: false`.
   An 80% sample let six "extremes" challenges (top five, max per group) pass
   with a literal; half does not.

**selftest.R** fails the build unless: every solution passes against itself;
every fix starter fails; a `deparse()`d literal of each expected answer fails
(unless `robust: false`; skipped for answers over 2,000 rows, which nobody
types in); each forbidden token slipped into the solution is caught.

Totals:

| Track | Modules | Subskills | Challenges | Probe trees | Animation steps | YAML lines |
|---|---|---|---|---|---|---|
| 2, `content/02-wrangling` | 7 | 30 | 56 | 14 | 43 | 1,429 |
| 3, `content/03-tidy` | 5 | 19 | 40 | 10 | 25 | 1,152 |
| 4, `content/04-joins` | 5 | 18 | 40 | 10 | 21 | 1,208 |

### Content format

**module.yml**
```yaml
id: 06-group-summarise
title: "group_by() + summarise(): one row per group"
key_idea: >- ...
subskills: [{id: g-collapse, name: "..."}, ...]
readings: [{label: "...", url: "..."}]       # url "" for the primer
predict:
  skill: g-collapse
  code: |
    penguins_sample |> group_by(species) |> summarise(...)
  ask: "..."
  show_data: true                              # show the animation's input table
  options:
    - {choice: "3 × 2", correct: true}
    - {choice: "3 × 3", misconception: summarise-keeps-columns, probe: "..."}
  verify: 'paste(nrow(result), "×", ncol(result))'   # R; `result` = the code's value
probes:
  - id: p-peel
    skill: g-peel
    ask: "..."
    options: [...]                             # same shape as predict
    right_followup: "Are you sure? ..."
    explain: "..."                             # shown after 3 misses
    verify: "..."                              # optional; TRUE or the correct choice text
```

**anim.yml**
```yaml
data: penguins_sample |> select(species, island, body_mass_g)
steps:
  - code: "group_by(species)"                  # piped onto the previous step's result
    tint: species                              # colour rows by this column
    caption: "..."
    skill: g-invisible                         # raises this subskill to 1 when watched
  - code: ""
    show: "group_by(species)"                  # display code (defaults to code)
    tint: species
    bands: true                                # stack rows by tint group, with labels
  - code: "summarise(m = mean(body_mass_g, na.rm = TRUE))"
    merge: {by: [species], pour: {m: body_mass_g}}   # required when rows collapse
  - from_data: true                            # restart from `data`
    code: "select(species, mass = body_mass_g)"
    renames: {mass: body_mass_g}               # keeps tile identity across a rename
  - code: 'pivot_longer(c(bill_length_mm, bill_depth_mm), names_to = "measure", values_to = "mm")'
    split: {names: measure, values: mm}        # one row -> several; each value tile flies
                                               #   to its long row (prefix: "bill_" with names_prefix)
  - code: 'pivot_wider(names_from = measure, values_from = mm)'
    widen: {names: measure, values: mm}        # several rows -> one; runs without .id;
                                               #   id columns merge, each new cell takes its tile
```
Joins: `with: band_instruments` names a second table (an expression, plus
`with_name:` if the step code refers to it by another name; **not `y:`**, which
YAML 1.1 reads as TRUE). Its rows are keyed `y1, y2, …`, its columns `y:<name>`.
```yaml
  - code: ""
    pair: true                                 # draw the `with` table beside x
    tint: name                                 # tint both by the key: matching keys share a colour
    tint_y: none                               # (optional) another tint column for y, or none
  - code: "left_join(band_instruments, join_by(name))"
    join: true                                 # x tiles stay, y tiles fly to their matched rows
```
A joined row's key is `<x id>+<y id>` (or one of them for unmatched rows).
Filtering joins keep `.id` and need nothing special.
Row identity is the hidden `.id` column (tile key `<row key>|<column id>`).
After `split`, row keys become `<id>:<name>`. Rows a step adds with no source
(`complete()`) get keys `+<n>` and fade in; duplicate keys fail the build. A
step that changes the row count needs `merge`, `split` or `widen`, unless the
verb keeps `.id` (filter, arrange, complete). Tint colours: penguin species
get their own; any other values (countries, years) take the same colours in
order of first appearance. List-column cells print like tibble (`<dbl [2]>`).

**challenges.yml** fields: `id, tier (warm-up|core|stretch|brain-melter),
type (write|fix|constrained|predict), skill, data (default penguins), prompt,
hint, solution, starter (fix), forbid, require (token lists checked on parse
data), compare: {ignore_row_order, ignore_column_order}, robust, uses`
(other datasets the challenge needs, e.g. `[planes]`: shown with their columns
next to the prompt; the half-sample re-run only touches `data`); predict
type adds `code, options, verify, explain`. Use `ignore_column_order` when a
correct answer can order columns differently (pivot_wider names columns in
order of first appearance; unite() puts the new column first). `robust: false`
(with a comment why) only when the half-sample re-run cannot work, e.g. on
6-row tables where a group loses a member: then a typed-in answer can pass.

Datasets: `penguins_sample` and `stocks` (7-row quarterly prices with one
explicit NA and one absent row, after r4ds 18.3) are defined in
`content/setup.R`; tidyr's `table1`–`table5`, `billboard`, `relig_income`,
`who2`, `world_bank_pop`, `fish_encounters`, `us_rent_income` come with tidyr.
Track 4 uses nycflights13 (`flights`, `airlines`, `airports`, `planes`,
`weather`), dplyr's `band_members` / `band_instruments` / `band_instruments2`,
and from setup.R: `instruments` (band_instruments plus John on piano, so name
repeats), `mass_bands` (made-up penguin mass ranges) and `fees` (made-up fee
by flight distance). Grading a join over all of flights takes about 1 s in webR.

**Animation sample:** `penguins_sample <- penguins[c(1, 277, 153, 21, 4, 278, 31, 154), ]`
with `.id` = those row numbers (tile keys). Row 4 has NA mass and NA sex on
purpose.

**Datasets used:** see above. nycflights13 (webR build 1.0.2, 4.5 MB) is now
installed and attached by setup.R.

### What build.R checks (fails the build on any problem)
- every animation step runs; collapsing steps declare `merge`;
- every challenge solution runs and obeys `forbid`/`require`;
- every fix starter is really broken (errors or gives a different result);
- every predict answer and every `verify` matches what R returns;
- 8 challenges per module; every subskill practised at least once.

It runs under webR (`.build_args` set by check.mjs) or native R
(`Rscript scripts/content/build.R content/02-wrangling out.json`).

### The app's lesson loop (ported from the prototype player)
- **Lesson page:** Predict (`Mcq` in `once` mode; the animation stays locked
  until the learner commits) → Watch (`TableMorph`: tiles keyed
  `rowKey|colId`; each step's layout is a pure function of that step, so it
  doesn't depend on which steps were viewed before; merges pour source tiles
  into result cells) → Probe (shown after the last step) → Do
  (predict-type challenges inline, the rest open the editor workspace).
- **Levels**, strictly:
  - 1: a right placement answer, or an animation step watched after predicting.
  - 2: a prediction or probe right on the first try.
  - 3: accepted after opening the hint today.
  - 4: clean solves (accepted, no hint or solution opened that day) on ≥2 days, **at least one from a review**.
  - 5: on top of 4, a clean stretch or brain-melter, or a final question right on the first try.
- **Reviews:**
  - Every review comes back after 1/3/7/21 days.
  - A missed prediction or probe review drops the skill one level.
  - The first clean solve below level 4 queues a challenge review for the next day.
  - Revealing the solution during a review counts as a miss.
- The review page has a clock-offset preview control (per track).
- Species colours are `--adelie`, `--chinstrap` and `--gentoo` in `src/app.css`. The app uses its own theme, not the prototype's palette or fonts.

---

## 6. Verified facts (as of 2026-11-24)

- **webR 0.6.0 is based on R 4.6.0.** It installs from npm with its R binary.
  The root app uses webR 0.6.1.
- R-universe has successful WebAssembly builds (R 4.6.0) of: dplyr 1.2.1,
  tidyr 1.3.2, ggplot2 4.0.3 (the vendored build is now **4.0.4**), readr
  2.2.0, stringr 1.6.0, forcats 1.0.1, purrr 1.2.2, lubridate 1.9.5,
  timechange 0.4.0, janitor 2.2.1, snakecase 0.11.1, stringi 1.8.9, hms
  1.1.4, palmerpenguins 0.1.1, nycflights13 1.0.2, testthat 3.3.2, waldo
  0.6.2, broom 1.0.13, readxl 1.6.0, skimr 2.2.2.
- **dplyr 1.2.0 changes that affect content:** `summarise()` returning more or
  fewer than one row per group is now an **error** (was a warning in 1.1), so use
  `reframe()`. Also new: `filter_out()` (drop rows, NA-safe),
  `when_any()`/`when_all()`, `case_when(.unmatched = "error")`,
  `recode_values()`/`replace_values()` replacing `case_match()`; `.by` is
  stable; `if_else()` no longer accepts a logical array as condition; the
  `...` argument of `across()` is deprecated.
- The probe `p-reframe` (05-summarise) was rewritten for this: the correct
  answer is now "An error that points you to reframe()", with a `verify` line.
  Native R with dplyr 1.1.4 fails that check, which is intended: content
  is pinned to the webR versions.
- **dplyr 1.2's `storms` covers 1975–2024 (50 years)**; dplyr 1.1.4's ended
  in 2022 (48). This changes the expected output of `06-group-summarise`
  challenge `.by` max wind (48 → 50 rows). Data change, not behaviour change.
- **First webR build, 2026-11-24:** `npm run build` in `track2/` passes
  ("All checks passed") in ~8 s once `vendor/library` exists. Compared with
  the old native-R (R 4.3.3, dplyr 1.1.4) output, the content differs only in
  the `p-reframe` probe and the `storms` row count above. The same checks
  under native R 4.5.3 + dplyr 1.2.1 on the Mac also pass, with output
  identical to webR's apart from the `built` metadata.
- **After the merge (same day):** webR 0.6.1 is still R 4.6.0. repo.r-wasm.org
  serves ggplot2 **4.0.3** (R-universe had 4.0.4); the generated JSON is
  identical to the track2 build apart from that version and the new `robust`
  field. `npm run content` takes ~50 s (build + 137 grader self-test checks).
- **Verified in the browser** (dev and production):
  - Predict locks the animation, and the summarise merge pours the tiles.
  - A wrong probe answer gets its narrower probe.
  - A forbidden token is flagged; a wrong answer shows a waldo diff.
  - A hand-typed answer fails the half-sample re-run.
  - `repeat {}` stops at 15 s and R restarts.
  - Hint → level 3; clean solve + clean review solve a day later → level 4.
  - Progress survives a reload.
  - The production build (88 MB, 66 prerendered pages) grades a challenge on a never-visited page with the server stopped.

---

## 7. Status and next steps (in order)

1. ~~**First real webR build.**~~ **Done 2026-11-24** (section 6). Lock file
   lists webr 0.6.0, R 4.6.0, dplyr 1.2.1, tidyr 1.3.2, ggplot2 4.0.4,
   palmerpenguins 0.1.1 and 27 dependencies.
2. ~~**Track 2 in the real app with webR grading.**~~ **Done 2026-11-24**
   (sections 0 and 5), together with old step 6 (the lesson-loop port).
3. ~~**Track 3, tidy data and reshaping.**~~ **Done 2026-11-24**: 5 modules,
   with the split/widen animation steps (section 5). Checked in the browser:
   pivot tiles move cell to cell, widen merges, the list-column case,
   complete()'s new row, and pipeline grading with relaxed column order.
4. ~~**Track 4, joins**~~ (and nycflights13). **Done 2026-11-24**: 5 modules
   with the pair/join animation steps; the key matcher is a shared tint per
   key value. Checked in the browser: tiles fly from y into matched rows,
   grading joins on all of flights (~1 s; a wrong answer ~1–3 s).
   Next by curriculum order: Track 5 (real-world data types), Track 6
   (visualization), or Track 1 (foundations, not yet written).
5. Consider adding `filter_out()` / `when_any()` to the filter module.
6. Write the **lubridate** track and the **janitor** modules (section 4).
7. Then the remaining tracks, one at a time, ~200 YAML lines per module. Each
   new track is a `content/<NN-name>/` folder; the routes and the content
   check pick it up automatically.
8. ~~**Deploy to GitHub Pages.**~~ **Done 2026-11-24**: every push to main
   builds and deploys (`.github/workflows/deploy.yml`) to
   https://robicruzo.github.io/leetR/. Tested locally first with
   `npm run serve:pages` (Pages-like server: sub-path, no COOP/COEP): the
   first visit reloads once, then the page is isolated via the service worker;
   grading and offline both work under /leetR/.
9. Smaller follow-ups:
   - a review queue across all tracks;
   - the timeline-ruler visual for lubridate;
   - lazy-loading ggplot2 at runtime (it is mounted at boot, though only `mpg` uses it so far).

---

## 8. Gotchas learned the hard way

- **YAML 1.1** reads unquoted keys/values `n`, `y`, `no`, `yes`, `on`, `off`
  as booleans: `pour: {n: species}` became `FALSE`. Quote them: `{"n": species}`.
- Set a UTF-8 locale in R (`Sys.setlocale("LC_CTYPE", "C.UTF-8")`), or YAML
  with `×` or curly quotes fails to read.
- jsonlite + `auto_unbox`: wrap one-element vectors meant as arrays in `I()`,
  or they become scalars (build.R's `AI()` helper does this, NULL-safe).
- Number display in animations: `format(x, digits = 4, trim = TRUE)` per value,
  like tibble printing.
- In webR, never call `quit()`; build.R sets `.build_status` instead.
- `webr::install(pkgs, repos, lib = "/work/vendor/library", mount = FALSE)`
  writes real files (with `mount = TRUE` packages are only mounted in memory).
  The project root is mounted at `/work` via NODEFS.
- `shelter.captureR()` returns messages as condition objects, not text;
  build.R prints its own log with `cat()` (`say()`) and suppresses package
  messages.
- `case_when()`: an NA condition is not TRUE, so NA rows fall through to
  `.default` (taught on purpose in the mutate module).
- `species == c("Adelie", "Gentoo")` recycles silently (138 rows, not 276);
  used in the final assessment.
- R 4.5+ ships its own `penguins` in `datasets` (columns `bill_len`, ...).
  `content/setup.R` attaches palmerpenguins after it, so `penguins` means
  palmerpenguins' version. Keep that order.
- **Svelte 5 state:** `const a = (state.x[k] ??= [])` gives the plain array,
  not the reactive proxy, so `a.push()` is lost. Assign, then re-read
  `state.x[k]`. This bug hid clean solves until it was found in browser testing.
- **Service worker:** preview servers send `Vary: Origin`, and module imports
  carry an `Origin` header that precache requests don't, so `cache.match`
  missed every lazily loaded chunk offline. The fix is `ignoreVary: true`.
- YAML 1.1 again: an anim.yml key `y:` silently became `TRUE`, so the
  second table never loaded. Hence `with:`.
- Grading errors used to vanish: captureR() with captured conditions turned
  an R error inside the grader into an empty "Wrong answer". The engine now
  passes `captureConditions: false`, so such errors are reported.
- Captions and prompts are prose, so no check can catch a wrong claim in
  them. A caption said `<int [2]>` for table2's list-column, but `count` is
  a double (`<dbl [2]>`); it was only caught by looking at the animation.
  Check every type or number a caption names in R.
- The content check rewrites `src/lib/generated/*.json` while the dev server
  watches it; build.R writes to `.tmp` and renames, or Vite can read a
  half-written file (`EOF while parsing`).
- Prerendered pages can't read the query string in `load()`; read
  `location.search` in `onMount` (the `?review=` link). Link to the slash form
  (`.../c/<id>/?review=`) so the query never goes through a redirect.

---

## 9. Design docs from the original chat

The curriculum doc, stack doc, first sample lesson and the published Track 2
prototype player are private claude.ai artifacts. Their links are in
`CLAUDE.local.md` on the author's machine.
