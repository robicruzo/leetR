# Build a track's content into JSON for the app, checking everything on the way.
#   Rscript scripts/content/build.R content/02-wrangling out.json
# (or inside webR via scripts/content/check.mjs, which sets `.build_args`).
# Runs every animation step on real data, runs every challenge solution,
# checks forbid/require rules, and verifies every answer that has a `verify`.
invisible(Sys.setlocale("LC_CTYPE", "C.UTF-8"))
suppressPackageStartupMessages({ library(yaml); library(jsonlite) })

in_webr <- exists(".build_args")
args <- if (in_webr) .build_args else commandArgs(trailingOnly = TRUE)
say <- function(...) cat(paste0(...), "\n", sep = "")
track_dir <- args[1]; out_file <- args[2]
problems <- character()
problem <- function(...) { msg <- paste0(...); problems <<- c(problems, msg); say("PROBLEM: ", msg) }

# Packages and shared data (penguins_sample, mpg): the same file the app sources.
source(file.path(dirname(track_dir), "setup.R"))
options(width = 72, pillar.width = 72, tibble.print_min = 5, tibble.print_max = 5, cli.num_colors = 1)

fmt <- function(v) {
  # A list-column cell prints like tibble does: <int [2]>
  if (is.list(v)) return(vapply(v, function(x) sprintf("<%s [%d]>", vctrs::vec_ptype_abbr(x), length(x)), ""))
  if (is.logical(v)) return(ifelse(is.na(v), "NA", ifelse(v, "TRUE", "FALSE")))
  if (is.numeric(v)) return(vapply(v, function(x) if (is.na(x)) "NA" else format(x, digits = 4, trim = TRUE), ""))
  v <- as.character(v); ifelse(is.na(v), "NA", v)
}
badge_of <- function(df) {
  if (!inherits(df, "grouped_df")) return("")
  sprintf("Groups: %s [%d]", paste(group_vars(df), collapse = ", "), n_groups(df))
}
AI <- function(x) if (is.null(x)) NULL else I(x)
run_code <- function(code, env) suppressMessages(eval(parse(text = code), envir = env))
new_env <- function() { e <- new.env(parent = globalenv()); e$penguins_sample <- penguins_sample; e }

# ---------- animations ----------
# Every animation table carries a hidden `.id` column: the row's tile key.
# A tile is "<row key>|<column id>", so the player can move the same tile
# from one step to the next. Steps that change the rows say how:
#   merge: {by, pour}      rows collapse into groups (summarise, count)
#   split: {names, values} one row becomes several (pivot_longer); each value
#                          tile travels from its wide cell to its long row
#   widen: {names, values} several rows become one (pivot_wider); each new
#                          cell takes the one tile it came from
#   pair: true             draw the second table (`with:`) beside the first
#   join: true             a join of the two: x tiles stay, y tiles fly into
#                          their matched rows, unmatched rows fade
# Rows a step adds with no source (e.g. complete()) get new keys and fade in.
#
# For joins, anim.yml names a second table: `with: band_instruments` (or any
# expression, with `with_name:` for the name the step code uses; not `y:`,
# which YAML 1.1 reads as TRUE). Its rows are
# keyed y1, y2, ... and its columns y:<name>, so the same column name in both
# tables stays two different tiles.
build_anim <- function(a, mod_id) {
  env <- new_env()
  data0 <- run_code(a$data, env)
  y_data <- NULL
  if (!is.null(a$with)) {
    y_data <- run_code(a$with, env)
    y_data$.yid <- paste0("y", seq_len(nrow(y_data)))
    assign(if (!is.null(a$with_name)) a$with_name else a$with, y_data, envir = env)
  }
  if (!".id" %in% names(data0)) {
    data0$.id <- if (nrow(data0) <= nrow(penguins_sample)) penguins_sample$.id[seq_len(nrow(data0))] else as.character(seq_len(nrow(data0)))
  }
  data0 <- relocate(data0, .id)
  prev <- data0; colid <- setNames(as.list(names(data0)), names(data0))
  steps <- list()
  for (i in seq_along(a$steps)) {
    s <- a$steps[[i]]
    where <- paste0(mod_id, " anim step ", i)
    base <- if (isTRUE(s$from_data)) data0 else prev
    if (isTRUE(s$from_data)) colid <- setNames(as.list(names(data0)), names(data0))
    widen <- s$widen; split <- s$split
    # pivot_wider() must not see the row keys, or no two rows could combine.
    env$.base <- if (!is.null(widen)) select(base, -.id) else base
    cur <- if (is.null(s$code) || s$code == "") base else
      tryCatch(run_code(paste0(".base |> ", s$code), env), error = function(e) { problem(where, ": ", conditionMessage(e)); base })
    merge <- s$merge
    from <- NULL; src <- NULL; by_cols <- NULL
    colid_of <- function(nm) if (!is.null(colid[[nm]])) colid[[nm]] else nm
    if (!is.null(merge)) {
      by <- unlist(merge$by)
      key_of <- function(df) if (length(by)) do.call(paste, c(lapply(by, function(b) fmt(df[[b]])), sep = "|")) else rep("all", nrow(df))
      src_keys <- key_of(base); out_keys <- key_of(cur)
      cur$.id <- paste0("g:", out_keys)
      from <- lapply(out_keys, function(k) base$.id[src_keys == k])
      by_cols <- as.character(by)
    } else if (!is.null(split)) {
      nm_col <- split$names; val_col <- split$values; prefix <- if (is.null(split$prefix)) "" else split$prefix
      if (!all(c(".id", nm_col, val_col) %in% names(cur))) {
        problem(where, ": split needs the result to keep .id and have columns ", nm_col, " and ", val_col)
      } else {
        orig <- cur$.id
        src_col <- paste0(prefix, fmt(cur[[nm_col]]))
        src <- lapply(seq_len(nrow(cur)), function(r) vapply(setdiff(names(cur), ".id"), function(nm) {
          if (nm == val_col) paste0(orig[r], "|", colid_of(src_col[r]))
          else if (nm == nm_col || !nm %in% names(base)) NA_character_
          else paste0(orig[r], "|", colid_of(nm))
        }, ""))
        cur$.id <- paste0(orig, ":", fmt(cur[[nm_col]]))
      }
    } else if (!is.null(widen)) {
      nm_col <- widen$names; val_col <- widen$values; prefix <- if (is.null(widen$prefix)) "" else widen$prefix
      by_cols <- intersect(setdiff(names(cur), ".id"), names(base))
      key_of <- function(df) if (length(by_cols)) do.call(paste, c(lapply(by_cols, function(b) fmt(df[[b]])), sep = "|")) else rep("all", nrow(df))
      src_keys <- key_of(base); out_keys <- key_of(cur)
      from <- lapply(out_keys, function(k) base$.id[src_keys == k])
      base_name <- paste0(prefix, fmt(base[[nm_col]]))
      src <- lapply(seq_len(nrow(cur)), function(r) vapply(names(cur), function(nm) {
        if (nm %in% by_cols) return(NA_character_)
        hit <- which(src_keys == out_keys[r] & base_name == nm)
        if (length(hit)) paste0(base$.id[hit[1]], "|", colid_of(val_col)) else NA_character_
      }, ""))
      cur$.id <- paste0("w:", out_keys)
      cur <- relocate(cur, .id)
    } else if (isTRUE(s$join) && ".yid" %in% names(cur)) {
      # Mutating join: each cell comes from its x row or its y row.
      xid <- cur$.id; yid <- cur$.yid
      y_cols <- setdiff(names(y_data), ".yid")
      src <- lapply(seq_len(nrow(cur)), function(r) vapply(setdiff(names(cur), c(".id", ".yid")), function(nm) {
        bare <- sub("[.](x|y)$", "", nm)
        from_x <- if (grepl("[.]x$", nm)) bare else if (nm %in% names(base)) nm else NA
        from_y <- if (grepl("[.]y$", nm)) bare else if (nm %in% y_cols) nm else NA
        if (!is.na(from_x) && !is.na(xid[r])) paste0(xid[r], "|", colid_of(from_x))
        else if (!is.na(from_y) && !is.na(yid[r])) paste0(yid[r], "|y:", from_y)
        else NA_character_
      }, ""))
      for (nm in setdiff(names(cur), c(".id", ".yid", names(base)))) {
        bare <- sub("[.]y$", "", nm)
        if (bare %in% y_cols) colid[[nm]] <- paste0("y:", bare)
      }
      cur$.id <- ifelse(is.na(xid), yid, ifelse(is.na(yid), xid, paste0(xid, "+", yid)))
      cur$.yid <- NULL
    } else if (!".id" %in% names(cur)) {
      if (nrow(cur) == nrow(base)) cur$.id <- base$.id else problem(where, ": rows changed without a merge, split, widen or join")
    }
    if (".id" %in% names(cur)) {
      new_rows <- which(is.na(cur$.id))
      cur$.id[new_rows] <- paste0("+", new_rows) # rows with no source, e.g. from complete()
      if (anyDuplicated(cur$.id)) problem(where, ": several rows share a key; declare split: {names, values}")
    }
    # column identities survive renames
    rn <- s$renames
    if (!is.null(rn)) for (new in names(rn)) colid[[new]] <- colid[[rn[[new]]]]
    for (nm in names(cur)) if (is.null(colid[[nm]])) colid[[nm]] <- nm
    vis <- setdiff(names(cur), ".id")
    rows <- lapply(seq_len(nrow(cur)), function(r) {
      row <- list(k = cur$.id[r], v = I(unname(vapply(vis, function(nm) fmt(cur[[nm]][r]), ""))))
      if (!is.null(s$tint)) row$t <- fmt(cur[[s$tint]][r])
      if (!is.null(from)) row$from <- I(from[[r]])
      if (!is.null(src)) row$src <- I(unname(src[[r]][vis]))
      row
    })
    # A pair step also draws the second table, to the right of the first.
    side <- NULL
    if (isTRUE(s$pair)) {
      if (is.null(y_data)) problem(where, ": pair needs a `with:` table in anim.yml")
      else {
        y_vis <- setdiff(names(y_data), ".yid")
        y_tint <- if (!is.null(s$tint_y)) s$tint_y else s$tint
        side <- list(cols = I(y_vis), ids = I(paste0("y:", y_vis)),
                     rows = lapply(seq_len(nrow(y_data)), function(r) {
                       row <- list(k = y_data$.yid[r], v = I(unname(vapply(y_vis, function(nm) fmt(y_data[[nm]][r]), ""))))
                       if (!is.null(y_tint) && y_tint %in% y_vis) row$t <- fmt(y_data[[y_tint]][r])
                       row
                     }))
      }
    }
    if (isTRUE(s$bands) && !is.null(s$tint)) {
      ord <- order(match(vapply(rows, `[[`, "", "t"), unique(vapply(rows, `[[`, "", "t"))))
      rows <- rows[ord]
    }
    steps[[i]] <- list(
      show = if (!is.null(s$show)) s$show else s$code,
      caption = s$caption, badge = badge_of(cur),
      cols = I(vis), ids = I(unname(vapply(vis, function(nm) colid[[nm]], ""))),
      rows = rows, bands = isTRUE(s$bands), tint = !is.null(s$tint),
      pour = if (!is.null(merge$pour)) merge$pour else NULL,
      by = AI(by_cols), merged = !is.null(merge) || !is.null(widen),
      hl = if (!is.null(s$hl)) AI(unlist(s$hl)) else NULL,
      late = if (!is.null(s$late)) AI(unlist(s$late)) else NULL,
      skill = s$skill, side = side
    )
    prev <- cur
  }
  list(steps = steps, data_table = table_of(data0))
}
table_of <- function(df) {
  vis <- setdiff(names(df), ".id")
  list(cols = I(vis), rows = lapply(seq_len(nrow(df)), function(r) I(unname(vapply(vis, function(nm) fmt(df[[nm]][r]), "")))))
}

# ---------- code checks ----------
tokens_of <- function(code) {
  pd <- getParseData(parse(text = code, keep.source = TRUE))
  pd$text[pd$terminal]
}
printed <- function(x) {
  if (is.data.frame(x)) {
    out <- capture.output(print(tibble::as_tibble(x), n = 5, width = 72))
    paste(out, collapse = "\n")
  } else paste(capture.output(print(x)), collapse = "\n")
}
same_result <- function(a, b, ignore_order) {
  if (!is.data.frame(a) || !is.data.frame(b)) return(identical(a, b))
  a <- ungroup(a); b <- ungroup(b)
  if (!identical(dim(a), dim(b)) || !identical(names(a), names(b))) return(FALSE)
  if (ignore_order) { a <- arrange(a, across(everything())); b <- arrange(b, across(everything())) }
  isTRUE(all.equal(as.data.frame(a), as.data.frame(b), check.attributes = FALSE))
}
check_challenge <- function(ch, mod_id) {
  where <- paste0(mod_id, "/", ch$id)
  env <- new_env()
  code <- if (ch$type == "predict") ch$code else ch$solution
  res <- tryCatch(withCallingHandlers(run_code(code, env), warning = function(w) invokeRestart("muffleWarning")),
                  error = function(e) { problem(where, ": solution fails: ", conditionMessage(e)); NULL })
  out <- list(id = ch$id, tier = ch$tier, type = ch$type, skill = ch$skill, prompt = ch$prompt,
              hint = ch$hint, solution = ch$solution, starter = ch$starter, code = ch$code,
              explain = ch$explain, data = if (!is.null(ch$data)) ch$data else "penguins",
              forbid = AI(unlist(ch$forbid)), require = AI(unlist(ch$require)), compare = ch$compare,
              robust = if (isFALSE(ch$robust)) FALSE else NULL, uses = AI(unlist(ch$uses)))
  if (is.null(res)) return(out)
  if (is.data.frame(res)) out$dims <- sprintf("%s rows × %s columns", format(nrow(res), big.mark = ","), ncol(res))
  out$expected <- printed(res)
  toks <- tokens_of(code)
  for (f in unlist(ch$forbid)) if (f %in% toks) problem(where, ": solution uses forbidden ", f)
  for (r in unlist(ch$require)) if (!r %in% toks) problem(where, ": solution lacks required ", r)
  if (ch$type == "predict") {
    env$result <- res
    ans <- paste(fmt(run_code(ch$verify, env)), collapse = ", ")
    if (!ans %in% unlist(ch$options)) problem(where, ": computed answer ", ans, " is not an option")
    out$options <- AI(unlist(ch$options)); out$answer <- ans
  }
  if (ch$type == "fix") {
    bad <- tryCatch(run_code(ch$starter, new_env()), error = function(e) e)
    if (!inherits(bad, "error") && same_result(bad, res, FALSE)) problem(where, ": starter already gives the right answer")
    out$starter_error <- if (inherits(bad, "error")) conditionMessage(bad) else NULL
  }
  out
}
verify_mcq <- function(q, where, env = new_env()) {
  correct <- Filter(function(o) isTRUE(o$correct), q$options)
  if (length(correct) != 1) problem(where, ": needs exactly one correct option")
  if (!is.null(q$verify)) {
    v <- tryCatch(run_code(q$verify, env), error = function(e) { problem(where, ": verify fails: ", conditionMessage(e)); NULL })
    if (!is.null(v) && !(isTRUE(v) || identical(paste(fmt(v), collapse = ", "), correct[[1]]$choice)))
      problem(where, ": verify gave ", paste(fmt(v), collapse = ", "), " but the correct option is ", correct[[1]]$choice)
  }
  q$verify <- NULL
  q
}

# ---------- datasets ----------
# Size and columns of each dataset a challenge uses, so the app can show them
# next to the prompt. Types are tibble's abbreviations (<dbl>, <fct>, ...).
# A run of 4+ numbered columns with one type, like wk1 ... wk76, is one entry.
dataset_info <- function(name) {
  df <- run_code(name, new_env())
  types <- unname(vapply(df, function(x) as.character(pillar::type_sum(x)), ""))
  nms <- names(df)
  shown <- ifelse(make.names(nms) == nms, nms, paste0("`", nms, "`"))
  m <- regmatches(nms, regexec("^(.*?)([0-9]+)$", nms))
  prefix <- vapply(m, function(x) if (length(x)) x[2] else NA_character_, "")
  num <- suppressWarnings(as.numeric(vapply(m, function(x) if (length(x)) x[3] else NA_character_, "")))
  cols <- list(); i <- 1
  while (i <= length(nms)) {
    j <- i
    while (j < length(nms) && !is.na(num[i]) && identical(prefix[j + 1], prefix[i]) &&
           identical(types[j + 1], types[i]) && isTRUE(num[j + 1] == num[j] + 1)) j <- j + 1
    if (j - i + 1 >= 4) {
      cols[[length(cols) + 1]] <- list(name = paste(shown[i], "…", shown[j]), type = types[[i]])
      i <- j + 1
    } else {
      cols[[length(cols) + 1]] <- list(name = shown[i], type = types[[i]])
      i <- i + 1
    }
  }
  list(rows = nrow(df), ncol = ncol(df), cols = cols)
}

# ---------- assemble ----------
track <- read_yaml(file.path(track_dir, "track.yml"))
counts <- list(modules = 0, challenges = 0, probes = 0, anim_steps = 0, lines = 0)
mods <- lapply(track$modules, function(m) {
  d <- file.path(track_dir, m)
  for (f in list.files(d, full.names = TRUE)) counts$lines <<- counts$lines + length(readLines(f, warn = FALSE))
  mod <- read_yaml(file.path(d, "module.yml"))
  anim <- read_yaml(file.path(d, "anim.yml"))
  chs <- read_yaml(file.path(d, "challenges.yml"))
  built <- build_anim(anim, m)
  # verify the predict question on the animation's own pipeline
  env <- new_env(); env$result <- run_code(mod$predict$code, env)
  mod$predict <- verify_mcq(mod$predict, paste0(m, "/predict"), env)
  mod$predict$data_table <- if (isTRUE(mod$predict$show_data)) built$data_table else NULL
  mod$probes <- lapply(mod$probes, function(p) verify_mcq(p, paste0(m, "/", p$id)))
  mod$anim <- built$steps
  mod$challenges <- lapply(chs, check_challenge, mod_id = m)
  tiers <- table(vapply(chs, `[[`, "", "tier"))
  if (length(chs) != 8) problem(m, ": has ", length(chs), " challenges, expected 8")
  sk <- vapply(mod$subskills, `[[`, "", "id")
  used <- unique(c(vapply(chs, `[[`, "", "skill"), mod$predict$skill, vapply(mod$probes, `[[`, "", "skill")))
  for (u in setdiff(used, sk)) problem(m, ": unknown subskill ", u)
  for (u in setdiff(sk, used)) problem(m, ": subskill ", u, " is never practised")
  counts$modules <<- counts$modules + 1; counts$challenges <<- counts$challenges + length(chs)
  counts$probes <<- counts$probes + length(mod$probes); counts$anim_steps <<- counts$anim_steps + length(anim$steps)
  mod
})
counts$lines <- counts$lines + length(readLines(file.path(track_dir, "track.yml")))
track$diagnostic <- lapply(track$diagnostic, function(q) verify_mcq(q, paste0("diagnostic/", q$id)))
track$final$questions <- lapply(track$final$questions, function(q) verify_mcq(q, paste0("final/", q$id)))
track$final$integrative <- check_challenge(c(track$final$integrative, list(type = "write", tier = "integrative", skill = "all")), "final")
track$modules <- mods
data_names <- unique(c(unlist(lapply(mods, function(m) lapply(m$challenges, function(ch) c(ch$data, unlist(ch$uses))))),
                       track$final$integrative$data, unlist(track$final$integrative$uses)))
track$datasets <- setNames(lapply(data_names, function(d) tryCatch(dataset_info(d), error = function(e) {
  problem("dataset ", d, ": ", conditionMessage(e)); NULL })), data_names)
pkgs <- c("dplyr", "tidyr", "ggplot2", "palmerpenguins")
track$built <- list(at = format(Sys.time(), "%Y-%m-%d"), r = R.version.string,
                    runtime = if (in_webr) "webR" else "native R",
                    dplyr = as.character(packageVersion("dplyr")),
                    packages = as.list(setNames(vapply(pkgs, function(p) as.character(packageVersion(p)), ""), pkgs)),
                    counts = counts)
# Write to a temporary file, then rename: a running dev server must never
# read a half-written file.
write(toJSON(track, auto_unbox = TRUE, null = "null", na = "null"), paste0(out_file, ".tmp"))
file.rename(paste0(out_file, ".tmp"), out_file)
say(sprintf("Built %d modules, %d challenges, %d probes, %d animation steps from %d lines of YAML.",
                counts$modules, counts$challenges, counts$probes, counts$anim_steps, counts$lines))
if (length(problems)) {
  say(length(problems), " problem(s).")
  if (in_webr) assign(".build_status", 1L, envir = globalenv()) else quit(status = 1)
} else say("All checks passed.")
