# Shared R setup for every track.
#
# Sourced into the global environment by both the content check
# (scripts/content/build.R, under webR or native R) and the app's R engine
# (src/lib/r/engine.svelte.ts), so animations, expected outputs and grading
# all see exactly the same data.

suppressPackageStartupMessages({
  library(dplyr)
  library(tidyr)
  library(purrr)
  library(stringr)
  library(forcats)
  library(lubridate)
  library(readr)
  library(janitor)
  library(ggplot2)  # Track 6; also provides mpg
  # Attached after `datasets`, so `penguins` is palmerpenguins' version
  # (bill_length_mm, ...), not the one base R 4.5+ ships (bill_len, ...).
  library(palmerpenguins)
  library(nycflights13) # flights, airlines, airports, planes, weather (lazy-loaded)
})


# The shared animation sample: 8 real penguins, keyed by their row in
# `penguins`. Row 4 has NA body mass and NA sex on purpose.
penguins_sample <- local({
  rows <- c(1, 277, 153, 21, 4, 278, 31, 154)
  penguins[rows, ] |> mutate(.id = as.character(rows))
})

# A small quarterly price table with both kinds of missing value (after r4ds
# 18.3): 2020 Q4 is an explicit NA, and 2021 Q1 has no row at all.
stocks <- tibble(
  year  = c(2020, 2020, 2020, 2020, 2021, 2021, 2021),
  qtr   = c(1, 2, 3, 4, 2, 3, 4),
  price = c(1.88, 0.59, 0.35, NA, 0.92, 0.17, 2.66)
)

# Joins (Track 4). dplyr's band_instruments with a second row for John, so
# name is not a key: joining to it copies John's row.
instruments <- bind_rows(band_instruments, tibble(name = "John", plays = "piano"))

# Made-up lookup tables for join_by() with ranges: penguin mass bands
# (2,700-6,300 g fits inside), and a baggage fee by flight distance.
mass_bands <- tibble(
  band = c("light", "medium", "heavy"),
  from = c(2500L, 3500L, 4500L),
  to   = c(3499L, 4499L, 6500L)
)
fees <- tibble(from_distance = c(0, 500, 1000, 2000), fee = c(25, 40, 60, 90))

# Real-world data (Track 5). stringr's word lists as tables, so a challenge
# can be re-run on half of them.
words_df <- tibble(word = stringr::words)
sentences_df <- tibble(sentence = stringr::sentences)

# Small made-up CSV files, as text (read them with read_csv(I(raw_scores))).
# raw_scores marks missing scores three different ways; raw_messy has messy
# column names, an empty row and an empty column.
raw_scores <- "student,score,submitted\nAna,92,2026-09-01\nBo,n/a,2026-09-03\nCy,-,2026-09-02\nDee,78,missing"
raw_messy <- "Student Name,Score (%),Notes,\nAna,92,,\n,,,\nBo,78,late,"

# Dates and times (Track 11). Made-up sign-up dates typed month/day/year,
# five of which can't be parsed that way; and dates written three ways.
signups <- tibble(
  id = 1:16,
  signed_up = c("01/15/2026", "02/03/2026", "02/30/2026", "03/11/2026", "04/31/2026",
                "05/05/2026", "06/18/2026", "13/01/2026", "07/24/2026", "08/22/2026",
                "09/09/2026", "", "10/12/2026", "11/30/2026", "12/25/2026", "2026-12-31")
)
mixed_dates <- tibble(
  event = c("kickoff", "deadline", "launch", "review", "holiday", "party", "picnic", "demo"),
  when  = c("2026-01-02", "03/14/2026", "5 June 2026", "2026-11-30",
            "12/25/2026", "1 May 2026", "07/24/2026", "2026-02-14")
)

# The timeline ruler: named moments as points on one time axis, labelled
# with their clock reading, and an optional dashed line where the clocks
# change. Moments that are NA can't be placed; they are listed below.
#   ruler(start = t, "+ ddays(1)" = t + ddays(1), change = jump)
ruler <- function(..., change = NULL) {
  pts <- list(...)
  times <- do.call(c, lapply(unname(pts), function(x) if (is.Date(x)) as_datetime(x) else x))
  d <- tibble(label = names(pts), time = times, level = seq_along(pts))
  dates_only <- all(vapply(pts, is.Date, TRUE))
  shown <- format(d$time, if (dates_only) "%a %d %b %Y" else "%d %b %H:%M %Z")
  d$text <- paste0(d$label, "\n", shown)
  missing <- d$label[is.na(d$time)]
  d <- d[!is.na(d$time), ]
  p <- ggplot(d, aes(time, 0)) +
    geom_hline(yintercept = 0, colour = "grey55") +
    geom_segment(aes(xend = time, yend = level), colour = "grey75") +
    geom_point(size = 3) +
    geom_label(aes(y = level, label = text), size = 3.6, linewidth = 0, lineheight = 0.95) +
    scale_y_continuous(NULL, breaks = NULL, limits = c(-0.8, length(pts) + 0.6)) +
    scale_x_datetime(NULL, expand = expansion(mult = 0.18),
                     date_labels = if (dates_only) "%d %b" else "%d %b\n%H:%M") +
    theme_minimal(base_size = 13)
  if (!is.null(change)) {
    p <- p +
      geom_vline(xintercept = change, linetype = "dashed", colour = "firebrick") +
      annotate("text", x = change, y = -0.55, label = "clocks change", colour = "firebrick", size = 3.6)
  }
  if (length(missing)) p <- p + labs(caption = paste("Not on the ruler (NA):", paste(missing, collapse = ", ")))
  p
}
