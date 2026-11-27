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
  # Attached after `datasets`, so `penguins` is palmerpenguins' version
  # (bill_length_mm, ...), not the one base R 4.5+ ships (bill_len, ...).
  library(palmerpenguins)
  library(nycflights13) # flights, airlines, airports, planes, weather (lazy-loaded)
})

# ggplot2 is heavy to load; only pay for it when a challenge touches `mpg`.
delayedAssign("mpg", ggplot2::mpg)

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
