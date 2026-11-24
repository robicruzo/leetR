# Shared R setup for every track.
#
# Sourced into the global environment by both the content check
# (scripts/content/build.R, under webR or native R) and the app's R engine
# (src/lib/r/engine.svelte.ts), so animations, expected outputs and grading
# all see exactly the same data.

suppressPackageStartupMessages({
  library(dplyr)
  library(tidyr)
  # Attached after `datasets`, so `penguins` is palmerpenguins' version
  # (bill_length_mm, ...), not the one base R 4.5+ ships (bill_len, ...).
  library(palmerpenguins)
})

# ggplot2 is heavy to load; only pay for it when a challenge touches `mpg`.
delayedAssign("mpg", ggplot2::mpg)

# The shared animation sample: 8 real penguins, keyed by their row in
# `penguins`. Row 4 has NA body mass and NA sex on purpose.
penguins_sample <- local({
  rows <- c(1, 277, 153, 21, 4, 278, 31, 154)
  penguins[rows, ] |> mutate(.id = as.character(rows))
})
