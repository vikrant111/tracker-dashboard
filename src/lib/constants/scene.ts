import type { Phase } from "../greeting.ts";

// ---------------------------------------------------------------------- scene
//
// How much of the greeting card's world to draw, and who is out in it.
//
// The line against `lib/sky.ts`: **counts and the schedule live here, geometry
// lives there.** "How many bats" is a product decision somebody might want to
// change without opening an SVG; "where the sun sits at 19:00" is only
// meaningful beside the half-sine that computes it.

export const SCENE = {
  /**
   * Who is out at which hour.
   *
   * Each animal keeps to one part of the day, which is what makes the scene
   * feel observed rather than decorated. Every phase needs **at least one**
   * companion or the card reads as empty — a check enforces that, so emptying a
   * row here fails the suite rather than quietly producing a barren afternoon.
   */
  cast: {
    morning: { crane: true, gull: true, squirrel: false, cat: false, bat: false },
    afternoon: { crane: false, gull: true, squirrel: true, cat: false, bat: false },
    evening: { crane: false, gull: false, squirrel: false, cat: true, bat: true },
    night: { crane: false, gull: false, squirrel: false, cat: true, bat: true },
  },

  /**
   * How many bats cross at dusk, 0 to 3.
   *
   * Each has its own distance, speed and wingbeat — the choreography lives with
   * the scene because it is animation, not a number anybody tunes. This picks
   * how many of them to use, and is clamped to what the choreography defines,
   * so raising it past that draws nothing rather than crashing.
   */
  bats: 3,

  /**
   * How many gulls soar over the afternoon, 0 to 3.
   *
   * Same arrangement as the bats: the choreography — how high each one rides,
   * how fast it crosses, how often it beats — lives with the scene, and this
   * picks how many of it to use. Clamped, so asking for more than exists draws
   * fewer rather than crashing.
   */
  gulls: 2,

  /**
   * How many cranes cross the morning, 0 to 2.
   *
   * The odd one out until now: the crane was a plain on/off in `cast` with its
   * flight hardcoded in the JSX, while the two flyers either side of it had
   * counts. Same arrangement as those now — the choreography lives with the
   * scene, this picks how many of it to use, and it is clamped.
   */
  cranes: 1,

  /**
   * Tufts of grass, far band and near band.
   *
   * Grass is drawn in **tufts, not blades** — one animation per tuft rather than
   * one per blade. The two together stay well under 50 animations, which is the
   * budget the card has before the scene costs real frame time; a check holds
   * the ceiling, and another holds the floor at which it still reads as a field
   * rather than as stubble.
   */
  grass: { back: 22, front: 16 },

  /**
   * How much cloud each weather condition puts in the sky.
   *
   * `clear` means the provider actually said clear, so one wisp is honest.
   * `unknown` is what an **unconfigured** sky gets: with no provider there is
   * nothing to be honest or dishonest about, so this is scenery rather than a
   * reading. The factual channel is the caption under the name, and that stays
   * empty unless the weather is real.
   */
  clouds: { clear: 1, cloudy: 3, overcast: 5, rain: 4, snow: 4, storm: 5, fog: 4, unknown: 4 },
} as const;
