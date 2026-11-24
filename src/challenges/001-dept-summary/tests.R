# Hidden tests for dept_summary(). `cases` are fixed inputs; `generate()` feeds
# random tables to both your function and the reference solution.

example <- tibble::tibble(
  name   = c("Ada", "Grace", "Linus", "Margaret", "Ken"),
  dept   = c("Eng", "Eng",   "Ops",   "Eng",      "Legal"),
  salary = c(150000, NA,     90000,   130000,     NA)
)

cases <- list(
  list(name = "Example from the prompt", args = list(staff = example)),
  list(
    name = "Tied averages break alphabetically",
    args = list(staff = tibble::tibble(
      name = c("a", "b", "c", "d"),
      dept = c("Zeta", "Alpha", "Mid", "Alpha"),
      salary = c(100, 100, 50, 100)
    ))
  ),
  list(
    name = "Department where every salary is unknown",
    hidden = TRUE,
    args = list(staff = tibble::tibble(
      name = c("a", "b", "c"),
      dept = c("Ghost", "Ghost", "Real"),
      salary = c(NA_real_, NA_real_, 10)
    ))
  ),
  list(
    name = "Empty table",
    hidden = TRUE,
    args = list(staff = tibble::tibble(name = character(), dept = character(), salary = double()))
  )
)

n_random <- 25

generate <- function(i) {
  n <- sample(0:30, 1)
  tibble::tibble(
    name = paste0("emp", seq_len(n)),
    dept = sample(c("Eng", "Ops", "Sales", "Legal", "Data"), n, replace = TRUE),
    salary = ifelse(runif(n) < 0.25, NA_real_, round(runif(n, 40, 200)) * 1000)
  ) |> list(staff = _)
}
