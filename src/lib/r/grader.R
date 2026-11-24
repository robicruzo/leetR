# leetR grading engine.
#
# Evaluated once into the global environment when the webR engine starts.
# Everything lives in the `.leetr` environment so user code can't trample it
# by accident (they'd have to go out of their way to touch `.leetr`).
#
# The JS side calls:
#   .leetr$grade(user_code, solution_code, tests_code, opts)
#   .leetr$run_examples(user_code, tests_code, fn_name)
# and converts the returned (plain) R list to JS.

.leetr <- new.env()

local(envir = .leetr, {

  `%||%` <- function(x, y) if (is.null(x)) y else x

  # ---------------------------------------------------------------------------
  # Structural checks (getParseData)
  # ---------------------------------------------------------------------------

  loop_tokens <- c(FOR = "for", WHILE = "while", REPEAT = "repeat")

  # Functions that can smuggle code past a static check.
  escape_hatches <- c("eval", "evalq", "parse", "str2lang", "str2expression",
                      "source", "sys.source", "do.call", "match.fun", "get", "get0",
                      "mget", "Recall")

  check_structure <- function(code, rules) {
    problems <- character()
    exprs <- tryCatch(parse(text = code, keep.source = TRUE), error = function(e) e)
    # Parse errors are reported when the code is run; nothing to check here.
    if (inherits(exprs, "error")) return(problems)
    pd <- utils::getParseData(exprs, includeText = TRUE)
    if (is.null(pd) || !nrow(pd)) return(problems)

    calls <- pd[pd$token == "SYMBOL_FUNCTION_CALL", c("text", "line1")]

    if (isTRUE(rules$no_loops)) {
      hits <- pd[pd$token %in% names(loop_tokens), ]
      for (i in seq_len(nrow(hits))) {
        problems <- c(problems, sprintf(
          "Line %d: `%s` loops are not allowed here. Think in whole vectors.",
          hits$line1[i], loop_tokens[[hits$token[i]]]
        ))
      }
      # Close the obvious loophole: building the loop as a string and eval()ing it.
      sneaky <- calls[calls$text %in% escape_hatches, ]
      for (i in seq_len(nrow(sneaky))) {
        problems <- c(problems, sprintf(
          "Line %d: `%s()` is not allowed in a no-loops challenge.",
          sneaky$line1[i], sneaky$text[i]
        ))
      }
    }

    for (fn in rules$forbid_call %||% character()) {
      lines <- calls$line1[calls$text == fn]
      if (length(lines)) {
        problems <- c(problems, sprintf(
          "Line %d: `%s()` is not allowed in this challenge.", lines[1], fn
        ))
      }
    }

    for (fn in rules$must_call %||% character()) {
      if (!fn %in% calls$text) {
        problems <- c(problems, sprintf("Your solution must use `%s()`.", fn))
      }
    }

    unique(problems)
  }

  # ---------------------------------------------------------------------------
  # Evaluation helpers
  # ---------------------------------------------------------------------------

  # Evaluate code in a fresh environment whose parent is the global env (so
  # attached packages like dplyr are visible) and return that environment.
  source_into <- function(code) {
    env <- new.env(parent = globalenv())
    eval(parse(text = code, keep.source = FALSE), envir = env)
    env
  }

  # Call `fn` with `args`, swallowing printed output, collecting warnings.
  safe_call <- function(fn, args) {
    warnings <- character()
    value <- NULL
    err <- NULL
    utils::capture.output(
      value <- tryCatch(
        withCallingHandlers(
          do.call(fn, args),
          warning = function(w) {
            warnings <<- c(warnings, conditionMessage(w))
            invokeRestart("muffleWarning")
          }
        ),
        error = function(e) { err <<- e; NULL }
      )
    )
    list(value = value, error = err, warnings = warnings)
  }

  sort_rows <- function(df) {
    if (!nrow(df) || !ncol(df)) return(df)
    keys <- lapply(df, function(col) if (is.list(col)) vapply(col, format, "") else col)
    out <- df[do.call(order, c(unname(keys), list(na.last = TRUE))), , drop = FALSE]
    rownames(out) <- NULL
    out
  }

  compare_values <- function(got, want, opts) {
    if (identical(opts$row_order, "ignore") && is.data.frame(got) && is.data.frame(want)) {
      got <- sort_rows(got)
      want <- sort_rows(want)
    }
    if (identical(opts$column_order, "ignore") && is.data.frame(got) && is.data.frame(want) &&
        setequal(names(got), names(want))) {
      got <- got[names(want)]
    }
    diff <- waldo::compare(
      got, want,
      x_arg = "yours", y_arg = "expected",
      tolerance = opts$tolerance %||% sqrt(.Machine$double.eps),
      ignore_attr = opts$ignore_attr %||% FALSE,
      max_diffs = 10
    )
    out <- as.character(diff)
    # waldo treats NaN and NA as equal once a numeric tolerance is set. In R
    # they are different values (and a classic bug), so check them strictly.
    if (!length(out) && !isFALSE(opts$strict_nan)) out <- nan_mismatch(got, want)
    paste(out, collapse = "\n\n")
  }

  nan_mismatch <- function(got, want, path = "") {
    if (is.double(got) && is.double(want) && length(got) == length(want)) {
      bad <- which(is.nan(got) != is.nan(want))
      if (length(bad)) {
        i <- bad[1]
        return(sprintf("`yours%s[%d]` is %s but `expected%s[%d]` is %s.",
                       path, i, format(got[i]), path, i, format(want[i])))
      }
    } else if (is.list(got) && is.list(want) && length(got) == length(want)) {
      nms <- names(want)
      for (j in seq_along(want)) {
        sub <- if (!is.null(nms) && nzchar(nms[j])) paste0("$", nms[j]) else sprintf("[[%d]]", j)
        m <- nan_mismatch(got[[j]], want[[j]], paste0(path, sub))
        if (length(m)) return(m)
      }
    }
    character()
  }

  describe_args <- function(args) {
    out <- utils::capture.output(
      for (nm in names(args)) {
        cat(nm, "=\n")
        print(args[[nm]])
      }
    )
    paste(out, collapse = "\n")
  }

  # Load tests.R. It must define `cases`: a list of
  #   list(name = "...", args = list(...), hidden = FALSE)
  # and may define `generate(i)` (returns an args list) plus `n_random`.
  load_tests <- function(tests_code) {
    env <- source_into(tests_code)
    cases <- get0("cases", envir = env, inherits = FALSE) %||% list()
    gen <- get0("generate", envir = env, inherits = FALSE)
    n_random <- get0("n_random", envir = env, inherits = FALSE) %||% 0L
    list(cases = cases, generate = gen, n_random = n_random)
  }

  # ---------------------------------------------------------------------------
  # Entry points
  # ---------------------------------------------------------------------------

  grade <- function(user_code, solution_code, tests_code, opts = list()) {
    fn_name <- opts$fn_name
    result <- list(
      passed = FALSE,
      structure = list(),
      cases = list(),
      error = NULL
    )

    # 1. Structural rules
    rules <- list(
      no_loops = isTRUE(opts$no_loops),
      must_call = unlist(opts$must_call),
      forbid_call = unlist(opts$forbid_call)
    )
    result$structure <- as.list(check_structure(user_code, rules))

    # 2. Load user code
    user_env <- tryCatch(source_into(user_code), error = function(e) e)
    if (inherits(user_env, "error")) {
      result$error <- paste("Error while running your code:", conditionMessage(user_env))
      return(result)
    }
    user_fn <- get0(fn_name, envir = user_env, inherits = FALSE)
    if (!is.function(user_fn)) {
      result$error <- sprintf("Define a function called `%s`.", fn_name)
      return(result)
    }

    ref_fn <- get(fn_name, envir = source_into(solution_code), inherits = FALSE)
    tests <- load_tests(tests_code)

    run_case <- function(name, args, hidden) {
      want <- safe_call(ref_fn, args)
      if (!is.null(want$error)) {
        stop(sprintf("Reference solution failed on case '%s': %s", name, conditionMessage(want$error)))
      }
      got <- safe_call(user_fn, args)
      detail <- ""
      status <- "pass"
      if (!is.null(got$error)) {
        status <- "error"
        detail <- conditionMessage(got$error)
      } else {
        detail <- compare_values(got$value, want$value, opts)
        if (nzchar(detail)) status <- "fail"
      }
      list(
        name = name,
        hidden = hidden,
        status = status,
        detail = if (hidden && status != "error") "" else detail,
        input = if (hidden || status == "pass") "" else describe_args(args)
      )
    }

    # 3. Fixed cases (visible examples + hidden edge cases)
    for (case in tests$cases) {
      result$cases[[length(result$cases) + 1]] <-
        run_case(case$name %||% "case", case$args, isTRUE(case$hidden))
    }

    # 4. Property tests: random inputs, user must agree with the reference.
    if (is.function(tests$generate) && tests$n_random > 0) {
      n_fail <- 0L
      first_fail <- NULL
      for (i in seq_len(tests$n_random)) {
        set.seed(i)
        args <- tests$generate(i)
        r <- run_case(sprintf("random #%d", i), args, hidden = FALSE)
        if (r$status != "pass") {
          n_fail <- n_fail + 1L
          if (is.null(first_fail)) first_fail <- r
        }
      }
      result$cases[[length(result$cases) + 1]] <- if (is.null(first_fail)) {
        list(name = sprintf("%d random inputs", tests$n_random), hidden = FALSE,
             status = "pass", detail = "", input = "")
      } else {
        first_fail$name <- sprintf("random inputs (%d of %d failed; first shown)",
                                   n_fail, tests$n_random)
        first_fail
      }
    }

    statuses <- vapply(result$cases, `[[`, "", "status")
    result$passed <- length(result$structure) == 0 && length(statuses) > 0 &&
      all(statuses == "pass")
    result
  }

  # "Run" button: source the user's code, then call their function on each
  # visible example and print the result. Output is captured by webR.
  run_examples <- function(user_code, tests_code, fn_name) {
    user_env <- source_into(user_code)
    user_fn <- get0(fn_name, envir = user_env, inherits = FALSE)
    if (!is.function(user_fn)) {
      message(sprintf("(Define a function called `%s` to see it run on the examples.)", fn_name))
      return(invisible(NULL))
    }
    tests <- load_tests(tests_code)
    for (case in tests$cases) {
      if (isTRUE(case$hidden)) next
      cat(sprintf("── %s(%s) ── %s\n", fn_name,
                  paste(names(case$args), collapse = ", "), case$name %||% ""))
      print(do.call(user_fn, case$args))
      cat("\n")
    }
    invisible(NULL)
  }

  # ===========================================================================
  # Pipeline ("snippet") challenges, used by the tracks.
  #
  # The learner writes code whose last value is the answer (usually a tibble),
  # working on a named dataset such as `penguins`. There is no function to
  # call, so instead of random inputs the grader re-runs both pieces of code on
  # a different sample of the dataset: an answer typed in by hand fails there.
  # ===========================================================================

  # Rules are checked on every terminal parse token, not only function calls,
  # so a challenge can forbid `|`, `.by` or a column name. This is the same
  # rule the content check applies to the reference solutions.
  token_problems <- function(code, forbid, require) {
    exprs <- tryCatch(parse(text = code, keep.source = TRUE), error = function(e) e)
    if (inherits(exprs, "error")) return(list(parse_error = conditionMessage(exprs), problems = character()))
    pd <- utils::getParseData(exprs)
    pd <- if (is.null(pd)) data.frame(text = character(), line1 = integer()) else pd[pd$terminal, ]
    problems <- character()
    for (tok in forbid) {
      lines <- pd$line1[pd$text == tok]
      if (length(lines)) problems <- c(problems, sprintf("Line %d: `%s` is not allowed in this challenge.", lines[1], tok))
    }
    for (tok in require) {
      if (!tok %in% pd$text) problems <- c(problems, sprintf("Your code must use `%s`.", tok))
    }
    list(parse_error = NULL, problems = problems)
  }

  # Evaluate code in a fresh environment (parent: global, where content/setup.R
  # was sourced) and return the value of its last expression. `data` optionally
  # rebinds dataset names, e.g. list(penguins = <a subsample>).
  eval_snippet <- function(code, data = list(), seed = 1L) {
    env <- new.env(parent = globalenv())
    for (nm in names(data)) assign(nm, data[[nm]], envir = env)
    exprs <- parse(text = code, keep.source = FALSE)
    if (!length(exprs)) stop("There is no code to run.", call. = FALSE)
    set.seed(seed) # so slice_sample() and friends agree between the two runs
    value <- NULL
    for (e in exprs) value <- eval(e, envir = env)
    value
  }

  safe_snippet <- function(code, data = list()) {
    err <- NULL
    value <- NULL
    utils::capture.output(
      value <- tryCatch(
        suppressMessages(withCallingHandlers(
          eval_snippet(code, data),
          warning = function(w) invokeRestart("muffleWarning")
        )),
        error = function(e) { err <<- e; NULL }
      )
    )
    list(value = value, error = err)
  }

  normalize <- function(x) {
    if (is.data.frame(x)) x <- tibble::as_tibble(dplyr::ungroup(x))
    x
  }

  # Half of the dataset, in the original row order. Half (not most) so that
  # extremes such as "the five heaviest" are likely to change.
  perturb <- function(df) {
    if (!is.data.frame(df) || nrow(df) < 5) return(NULL)
    set.seed(2026)
    df[sort(sample.int(nrow(df), floor(nrow(df) / 2))), , drop = FALSE]
  }

  # opts: data ("penguins"), ignore_row_order, ignore_column_order, forbid,
  # require, robust.
  # Returns the same shape as grade(), so the app shows both kinds alike.
  grade_snippet <- function(user_code, solution_code, opts = list()) {
    result <- list(passed = FALSE, structure = list(), cases = list(), error = NULL)
    cmp_opts <- list(row_order = if (isTRUE(opts$ignore_row_order)) "ignore" else "strict",
                     column_order = if (isTRUE(opts$ignore_column_order)) "ignore" else "strict")

    rules <- token_problems(user_code, unlist(opts$forbid), unlist(opts$require))
    if (!is.null(rules$parse_error)) {
      result$error <- paste("Your code does not parse:", rules$parse_error)
      return(result)
    }
    result$structure <- as.list(rules$problems)

    # `optional`: on a data sample the reference itself may fail (a small
    # table can lose a whole group); then that check is skipped, not failed.
    check <- function(name, data, optional = FALSE) {
      want <- safe_snippet(solution_code, data)
      if (!is.null(want$error)) {
        if (optional) return(NULL)
        stop(sprintf("The reference solution failed on '%s': %s", name, conditionMessage(want$error)))
      }
      got <- safe_snippet(user_code, data)
      if (!is.null(got$error)) {
        return(list(name = name, hidden = FALSE, status = "error",
                    detail = conditionMessage(got$error), input = ""))
      }
      detail <- compare_values(normalize(got$value), normalize(want$value), cmp_opts)
      list(name = name, hidden = FALSE, status = if (nzchar(detail)) "fail" else "pass",
           detail = detail, input = "")
    }

    data_name <- opts$data %||% "penguins"
    main <- check(sprintf("Your result on %s", data_name), list())
    result$cases[[1]] <- main

    if (main$status == "pass" && !isFALSE(opts$robust)) {
      original <- get0(data_name, envir = globalenv())
      sub <- perturb(original)
      if (!is.null(sub)) {
        again <- check(sprintf("Same code on a different sample of %s (%d of %d rows)",
                               data_name, nrow(sub), nrow(original)),
                       stats::setNames(list(sub), data_name), optional = TRUE)
        if (!is.null(again) && again$status == "fail") {
          again$detail <- paste0(
            "Your code matches on the full data but not on a sample of it. ",
            "Does it depend on specific values or rows instead of computing them?\n\n",
            again$detail)
        }
        if (!is.null(again)) result$cases[[2]] <- again
      }
    }

    statuses <- vapply(result$cases, `[[`, "", "status")
    result$passed <- length(result$structure) == 0 && all(statuses == "pass")
    result
  }

  # "Run" for a snippet: evaluate it like the console does, printing each
  # visible value. Output, messages and warnings are captured by webR.
  run_snippet <- function(code) {
    env <- new.env(parent = globalenv())
    exprs <- parse(text = code, keep.source = FALSE)
    for (e in exprs) {
      res <- withVisible(eval(e, envir = env))
      if (res$visible) print(res$value)
    }
    invisible(NULL)
  }
})
