---
id: dept-summary
title: Department payroll summary
difficulty: easy
track: The tidyverse
tags: [dplyr, summarise, NA handling]
function: dept_summary
packages: [dplyr]
compare:
  row_order: strict
rules:
  no_loops: true
---

HR hands you a `staff` table with one row per employee:

| column   | type      | notes                                   |
|----------|-----------|-----------------------------------------|
| `name`   | character |                                         |
| `dept`   | character | department name                         |
| `salary` | double    | may be `NA` when the salary is unknown  |

Write `dept_summary(staff)` that returns a tibble with **one row per department** and the columns:

- `dept`
- `n`: the number of employees in that department (count every row, even ones with unknown salary)
- `avg_salary`: the mean of the **known** salaries. If a department has no known salaries at all, this must be `NA` (not `NaN`).

Sort the rows by `avg_salary`, highest first. Departments with `NA` go last, and ties are broken by `dept` in alphabetical order.

**Constraint:** no `for`, `while` or `repeat` loops. dplyr is already loaded.

### Example

```r
staff <- tibble(
  name   = c("Ada", "Grace", "Linus", "Margaret", "Ken"),
  dept   = c("Eng", "Eng",   "Ops",   "Eng",      "Legal"),
  salary = c(150000, NA,     90000,   130000,     NA)
)
dept_summary(staff)
#> # A tibble: 3 × 3
#>   dept      n avg_salary
#>   <chr> <int>      <dbl>
#> 1 Eng       3     140000
#> 2 Ops       1      90000
#> 3 Legal     1         NA
```

## Hints

### Hint 1
`summarise()` with `.by = dept` gives one row per department without needing `group_by()` / `ungroup()`.

### Hint 2
`mean(x, na.rm = TRUE)` of a vector that is entirely `NA` returns `NaN`, not `NA`. Check for that case explicitly, e.g. with `if (all(is.na(salary)))`.

### Hint 3
`arrange(desc(avg_salary), dept)`. `arrange()` always puts `NA` last, even inside `desc()`.

## Explanation

The trap is the "no known salaries" department. `mean(c(NA, NA), na.rm = TRUE)` drops every value and then averages an empty vector, which is `0 / 0 = NaN`. `NaN` and `NA` print differently and `waldo::compare()` treats them as different, so the hidden test catches it.

The other subtle part is `n`: `n()` counts rows, while `sum(!is.na(salary))` counts known salaries. The spec asks for rows.
