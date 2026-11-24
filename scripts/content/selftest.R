# Grade every challenge of a built track with the app's own grader.
#   (run by scripts/content/check.mjs inside webR, after build.R)
#
# build.R proves the content is right; this proves the grader can tell right
# from wrong on it. For every non-predict challenge:
#   - the reference solution passes when graded against itself;
#   - a fix-it starter fails;
#   - the expected answer typed in as a literal fails (the re-run on a sample
#     of the data catches it), unless the challenge says `robust: false`;
#   - each forbidden token, slipped into the solution, is caught as a rule.
invisible(Sys.setlocale("LC_CTYPE", "C.UTF-8"))
args <- .selftest_args
json_file <- args[1]; grader_file <- args[2]
source(grader_file) # defines .leetr in the global environment

say <- function(...) cat(paste0(...), "\n", sep = "")
problems <- character()
problem <- function(...) { msg <- paste0(...); problems <<- c(problems, msg); say("PROBLEM: ", msg) }

track <- jsonlite::fromJSON(json_file, simplifyVector = FALSE)
gradable <- list()
for (m in track$modules) for (ch in m$challenges) {
  if (!identical(ch$type, "predict")) gradable[[length(gradable) + 1]] <- c(ch, list(where = paste0(m$id, "/", ch$id)))
}
ig <- track$final$integrative
if (!is.null(ig)) gradable[[length(gradable) + 1]] <- c(ig, list(where = paste0("final/", ig$id)))

opts_of <- function(ch) list(
  data = ch$data %||% "penguins",
  ignore_row_order = isTRUE(ch$compare$ignore_row_order),
  forbid = unlist(ch$forbid), require = unlist(ch$require),
  robust = !isFALSE(ch$robust)
)
`%||%` <- function(x, y) if (is.null(x)) y else x
grade <- function(code, ch) tryCatch(
  .leetr$grade_snippet(code, ch$solution, opts_of(ch)),
  error = function(e) { problem(ch$where, ": grader error: ", conditionMessage(e)); NULL }
)
inject <- function(tok) {
  if (grepl("^[A-Za-z.][A-Za-z0-9._]*$", tok)) sprintf("invisible(quote(%s))", tok)
  else sprintf("invisible(quote(a %s b))", tok)
}

checks <- 0L
for (ch in gradable) {
  r <- grade(ch$solution, ch); checks <- checks + 1L
  if (!is.null(r) && !isTRUE(r$passed)) {
    problem(ch$where, ": the solution fails its own grading: ",
            paste(c(unlist(r$structure), r$error, vapply(r$cases, function(k) k$detail, "")), collapse = " | "))
  }

  if (identical(ch$type, "fix")) {
    r <- grade(ch$starter, ch); checks <- checks + 1L
    if (!is.null(r) && isTRUE(r$passed)) problem(ch$where, ": the broken starter passes grading")
  }

  if (!isFALSE(ch$robust)) {
    value <- tryCatch(suppressMessages(.leetr$eval_snippet(ch$solution)), error = function(e) NULL)
    if (!is.null(value)) {
      literal <- paste(deparse(value, control = c("keepNA", "keepInteger", "niceNames", "showAttributes")), collapse = "\n")
      r <- grade(literal, ch); checks <- checks + 1L
      if (!is.null(r) && isTRUE(r$passed)) {
        problem(ch$where, ": a typed-in copy of the expected answer passes. ",
                "Make the answer depend on the data, or add `robust: false` to the challenge.")
      }
    }
  }

  for (tok in unlist(ch$forbid)) {
    r <- grade(paste0(inject(tok), "\n", ch$solution), ch); checks <- checks + 1L
    if (!is.null(r) && (isTRUE(r$passed) || !length(r$structure))) problem(ch$where, ": forbidden `", tok, "` is not caught")
  }
}

say(sprintf("Grader self-test: %d challenges, %d checks, %d problem(s).", length(gradable), checks, length(problems)))
if (length(problems)) assign(".selftest_status", 1L, envir = globalenv())
