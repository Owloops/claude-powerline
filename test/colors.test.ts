import {
  getColorSupport,
  hexToBasicAnsi,
  hexToAnsi,
  hexTo256Ansi,
  extractBgToFg,
} from "../src/utils/colors";
import { getTheme } from "../src/themes";

describe("Colors", () => {
  describe("Core Color Functions", () => {
    it("should convert hex to truecolor ANSI", () => {
      expect(hexToAnsi("#FF0000", false)).toBe("\x1b[38;2;255;0;0m");
      expect(hexToAnsi("#00FF00", true)).toBe("\x1b[48;2;0;255;0m");
    });

    it("should convert background to foreground ANSI", () => {
      expect(extractBgToFg("\x1b[48;2;255;100;50m")).toBe(
        "\x1b[38;2;255;100;50m"
      );
      expect(extractBgToFg("\x1b[41m")).toBe("\x1b[31m");
    });

    it("should handle transparent backgrounds", () => {
      expect(hexToAnsi("transparent", true)).toBe("\x1b[49m");
      expect(hexTo256Ansi("transparent", true)).toBe("\x1b[49m");
      expect(hexToBasicAnsi("transparent", true)).toBe("\x1b[49m");
    });
  });

  describe("Terminal Detection", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it("should detect macOS Terminal as ansi256", () => {
      process.env = {};
      process.env.TERM_PROGRAM = "Apple_Terminal";
      expect(getColorSupport()).toBe("ansi256");
    });

    it("should detect modern terminals as truecolor", () => {
      process.env = {};
      process.env.TERM_PROGRAM = "vscode";
      expect(getColorSupport()).toBe("truecolor");

      process.env = {};
      process.env.TERM = "alacritty";
      expect(getColorSupport()).toBe("truecolor");
    });

    it("should respect NO_COLOR", () => {
      process.env = {};
      process.env.NO_COLOR = "1";
      expect(getColorSupport()).toBe("none");
    });

    it("should respect NO_COLOR standard (any non-empty value)", () => {
      process.env = {};
      process.env.NO_COLOR = "potato";
      expect(getColorSupport()).toBe("none");

      process.env = {};
      process.env.NO_COLOR = "";
      expect(getColorSupport()).not.toBe("none");
    });

    it("should respect FORCE_COLOR standard (overrides NO_COLOR)", () => {
      process.env = {};
      process.env.NO_COLOR = "1";
      process.env.FORCE_COLOR = "1";
      expect(getColorSupport()).toBe("ansi");

      process.env = {};
      process.env.NO_COLOR = "1";
      process.env.FORCE_COLOR = "3";
      expect(getColorSupport()).toBe("truecolor");
    });

    it("should handle FORCE_COLOR values correctly", () => {
      process.env = {};
      process.env.FORCE_COLOR = "0";
      expect(getColorSupport()).toBe("none");

      process.env = {};
      process.env.FORCE_COLOR = "1";
      expect(getColorSupport()).toBe("ansi");

      process.env = {};
      process.env.FORCE_COLOR = "2";
      expect(getColorSupport()).toBe("ansi256");

      process.env = {};
      process.env.FORCE_COLOR = "3";
      expect(getColorSupport()).toBe("truecolor");

      process.env = {};
      process.env.FORCE_COLOR = "yes";
      expect(getColorSupport()).toBe("ansi");

      process.env = {};
      process.env.FORCE_COLOR = "";
      expect(getColorSupport()).not.toBe("ansi");
    });

    it("should generate correct ANSI codes for different modes", () => {
      const ansi256 = hexTo256Ansi("#FF0000", false);
      expect(ansi256.startsWith("\u001b[38;5;")).toBe(true);

      expect(hexToBasicAnsi("#FF0000", true)).toBe("");
      expect(hexToBasicAnsi("#FF0000", false)).toContain("31");
    });

    it("should select correct theme variants by color support", () => {
      const ansi256Theme = getTheme("nord", "ansi256");
      expect(ansi256Theme?.directory.bg).toBe("#5f87af");

      const ansiTheme = getTheme("nord", "ansi");
      expect(ansiTheme?.directory.bg).toBe("#0087af");

      const truecolorTheme = getTheme("nord", "truecolor");
      expect(truecolorTheme?.directory.bg).toBe("#434c5e");

      const noneTheme = getTheme("nord", "none");
      expect(noneTheme?.directory.bg).toBe(ansiTheme?.directory.bg);
    });
  });
});
