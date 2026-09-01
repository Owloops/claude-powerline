import {
  getMoonPhaseEmoji,
  getMoonPhaseMonochrome,
  getMoonPhaseNerdFont,
  getMoonPhaseIcon,
} from "../src/utils/moonPhase";

const SYNODIC_MONTH_DAYS = 29.530588853;
const KNOWN_NEW_MOON_MS = new Date("2000-01-06T18:14:00.000Z").getTime();
const MS_PER_DAY = 86400000;

function atDaysAfterEpoch(days: number): Date {
  return new Date(KNOWN_NEW_MOON_MS + days * MS_PER_DAY);
}

describe("getMoonPhaseEmoji", () => {
  it("returns new moon at the reference epoch", () => {
    expect(getMoonPhaseEmoji(atDaysAfterEpoch(0))).toBe("🌑");
  });

  it("returns waxing crescent shortly after new moon", () => {
    expect(
      getMoonPhaseEmoji(atDaysAfterEpoch(SYNODIC_MONTH_DAYS / 8 + 1)),
    ).toBe("🌒");
  });

  it("returns full moon at half the cycle", () => {
    expect(
      getMoonPhaseEmoji(atDaysAfterEpoch(SYNODIC_MONTH_DAYS / 2 + 1)),
    ).toBe("🌕");
  });

  it("returns last quarter three-quarters through the cycle", () => {
    expect(
      getMoonPhaseEmoji(atDaysAfterEpoch((SYNODIC_MONTH_DAYS * 6) / 8 + 1)),
    ).toBe("🌗");
  });

  it("wraps back to new moon after a full synodic month", () => {
    expect(getMoonPhaseEmoji(atDaysAfterEpoch(SYNODIC_MONTH_DAYS + 1))).toBe(
      "🌑",
    );
  });

  it("cycles through all 8 phases across one synodic month", () => {
    const phases = new Set<string>();
    for (let i = 0; i < 30; i++) {
      phases.add(getMoonPhaseEmoji(atDaysAfterEpoch(i)));
    }
    expect(phases.size).toBe(8);
  });

  it("defaults to the current date when none is provided", () => {
    expect(() => getMoonPhaseEmoji()).not.toThrow();
  });
});

describe("getMoonPhaseMonochrome", () => {
  it("returns a new moon glyph at the reference epoch", () => {
    expect(getMoonPhaseMonochrome(atDaysAfterEpoch(0))).toBe("○");
  });

  it("returns a full moon glyph at half the cycle", () => {
    expect(
      getMoonPhaseMonochrome(atDaysAfterEpoch(SYNODIC_MONTH_DAYS / 2 + 1)),
    ).toBe("●");
  });

  it("cycles through exactly 4 phases across one synodic month", () => {
    const phases = new Set<string>();
    for (let i = 0; i < 30; i++) {
      phases.add(getMoonPhaseMonochrome(atDaysAfterEpoch(i)));
    }
    expect(phases.size).toBe(4);
  });
});

describe("getMoonPhaseNerdFont", () => {
  const NERD_FONT_MOON_MIN = 0xe38d;
  const NERD_FONT_MOON_MAX = 0xe3a8;

  it("returns a codepoint within the Weather Icons moon block", () => {
    for (let i = 0; i < 30; i++) {
      const glyph = getMoonPhaseNerdFont(atDaysAfterEpoch(i));
      const codePoint = glyph.codePointAt(0)!;
      expect(codePoint).toBeGreaterThanOrEqual(NERD_FONT_MOON_MIN);
      expect(codePoint).toBeLessThanOrEqual(NERD_FONT_MOON_MAX);
    }
  });

  it("returns the new moon glyph at the reference epoch", () => {
    expect(getMoonPhaseNerdFont(atDaysAfterEpoch(0)).codePointAt(0)).toBe(
      NERD_FONT_MOON_MIN,
    );
  });

  it("cycles through all 28 phases across one synodic month", () => {
    const phases = new Set<string>();
    for (let i = 0; i < 30; i++) {
      phases.add(getMoonPhaseNerdFont(atDaysAfterEpoch(i)));
    }
    expect(phases.size).toBe(28);
  });
});

describe("getMoonPhaseIcon", () => {
  it("dispatches to the matching style", () => {
    const date = atDaysAfterEpoch(0);
    expect(getMoonPhaseIcon("emoji", date)).toBe(getMoonPhaseEmoji(date));
    expect(getMoonPhaseIcon("monochrome", date)).toBe(
      getMoonPhaseMonochrome(date),
    );
    expect(getMoonPhaseIcon("nerd-font", date)).toBe(
      getMoonPhaseNerdFont(date),
    );
  });
});
