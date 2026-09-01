const SYNODIC_MONTH_DAYS = 29.530588853;
const KNOWN_NEW_MOON_MS = new Date("2000-01-06T18:14:00.000Z").getTime();
const MS_PER_DAY = 86400000;

export type MoonIconStyle = "nerd-font" | "monochrome" | "emoji";

const MOON_PHASE_EMOJI = [
  "🌑", // New Moon
  "🌒", // Waxing Crescent
  "🌓", // First Quarter
  "🌔", // Waxing Gibbous
  "🌕", // Full Moon
  "🌖", // Waning Gibbous
  "🌗", // Last Quarter
  "🌘", // Waning Crescent
] as const;

const MOON_PHASE_MONOCHROME = [
  "○", // New Moon
  "◖", // First Quarter (waxing)
  "●", // Full Moon
  "◗", // Last Quarter (waning)
] as const;

/**
 * Nerd Fonts' Weather Icons moon set (`wi-moon-*`) is a contiguous 28-glyph
 * PUA block in cycle order: new, 6x waxing crescent, first quarter, 6x
 * waxing gibbous, full, 6x waning gibbous, last quarter, 6x waning crescent.
 * Codepoints verified against ryanoasis/nerd-fonts' glyphnames.json.
 */
const NERD_FONT_MOON_BASE_CODEPOINT = 0xe38d;
const NERD_FONT_MOON_PHASE_COUNT = 28;

function getCyclePosition(date: Date): number {
  const daysSinceKnownNewMoon =
    (date.getTime() - KNOWN_NEW_MOON_MS) / MS_PER_DAY;
  return (
    ((daysSinceKnownNewMoon % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) %
    SYNODIC_MONTH_DAYS
  );
}

function getPhaseIndex(date: Date, phaseCount: number): number {
  const cyclePosition = getCyclePosition(date);
  return (
    Math.floor((cyclePosition / SYNODIC_MONTH_DAYS) * phaseCount) % phaseCount
  );
}

/**
 * Approximates today's lunar phase from a known new moon epoch and the mean
 * synodic month length. Accurate to within about a day, which is plenty for
 * a cosmetic status line icon.
 */
export function getMoonPhaseEmoji(date: Date = new Date()): string {
  return MOON_PHASE_EMOJI[getPhaseIndex(date, MOON_PHASE_EMOJI.length)]!;
}

/** Plain-Unicode 4-state phase indicator: takes on the terminal's ANSI foreground color, unlike the fixed-palette color emoji. */
export function getMoonPhaseMonochrome(date: Date = new Date()): string {
  return MOON_PHASE_MONOCHROME[
    getPhaseIndex(date, MOON_PHASE_MONOCHROME.length)
  ]!;
}

/** Requires a Nerd Font–patched terminal font (Weather Icons glyph set); not detectable at runtime, so this is opt-in via config. */
export function getMoonPhaseNerdFont(date: Date = new Date()): string {
  const index = getPhaseIndex(date, NERD_FONT_MOON_PHASE_COUNT);
  return String.fromCodePoint(NERD_FONT_MOON_BASE_CODEPOINT + index);
}

export function getMoonPhaseIcon(
  style: MoonIconStyle,
  date: Date = new Date(),
): string {
  switch (style) {
    case "nerd-font":
      return getMoonPhaseNerdFont(date);
    case "emoji":
      return getMoonPhaseEmoji(date);
    case "monochrome":
      return getMoonPhaseMonochrome(date);
  }
}
