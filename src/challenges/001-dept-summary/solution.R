dept_summary <- function(staff) {
  staff |>
    summarise(
      n = n(),
      avg_salary = if (all(is.na(salary))) NA_real_ else mean(salary, na.rm = TRUE),
      .by = dept
    ) |>
    arrange(desc(avg_salary), dept)
}
