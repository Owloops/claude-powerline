import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "../src/config/defaults";
import { loadConfig, loadConfigFromCLI } from "../src/config/loader";

jest.mock("node:fs");
jest.mock("node:os");

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

describe("config", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue("/home/user");
    jest.spyOn(process, "cwd").mockReturnValue("/project");
  });

  describe("DEFAULT_CONFIG", () => {
    it("should have valid structure", () => {
      expect(DEFAULT_CONFIG.theme).toBe("dark");
      expect(DEFAULT_CONFIG.display.lines).toHaveLength(1);
      expect(DEFAULT_CONFIG.display.style).toBe("minimal");
      expect(DEFAULT_CONFIG.budget?.session).toBeDefined();
    });
  });

  describe("loadConfig", () => {
    it("should return defaults when no config exists", () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(loadConfig()).toEqual(DEFAULT_CONFIG);
    });

    it("should merge project config over defaults", () => {
      const projectConfig = { theme: "dark" };
      mockFs.existsSync.mockImplementation(
        (p) => p === path.join("/project", ".claude-powerline.json")
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify(projectConfig));

      const config = loadConfig();
      expect(config.theme).toBe("dark");
      expect(config.display).toEqual(DEFAULT_CONFIG.display);
    });

    it("should handle invalid JSON gracefully", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue("invalid json");

      const config = loadConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("CLI argument parsing", () => {
    it("should parse theme from CLI with = syntax", () => {
      mockFs.existsSync.mockReturnValue(false);
      const config = loadConfigFromCLI(["node", "script", "--theme=dark"]);
      expect(config.theme).toBe("dark");
    });

    it("should parse theme from CLI with space syntax", () => {
      mockFs.existsSync.mockReturnValue(false);
      const config = loadConfigFromCLI(["node", "script", "--theme", "dark"]);
      expect(config.theme).toBe("dark");
    });

    it("should parse capsule style from CLI with = syntax", () => {
      mockFs.existsSync.mockReturnValue(false);
      const config = loadConfigFromCLI(["node", "script", "--style=capsule"]);
      expect(config.display.style).toBe("capsule");
    });

    it("should parse capsule style from CLI with space syntax", () => {
      mockFs.existsSync.mockReturnValue(false);
      const config = loadConfigFromCLI(["node", "script", "--style", "capsule"]);
      expect(config.display.style).toBe("capsule");
    });

    it("should preserve display lines when setting style via CLI", () => {
      mockFs.existsSync.mockReturnValue(false);
      const config = loadConfigFromCLI(["node", "script", "--style=powerline"]);
      expect(config.display.style).toBe("powerline");
      expect(config.display.lines).toHaveLength(
        DEFAULT_CONFIG.display.lines.length
      );
      expect(config.display.lines[0]?.segments).toEqual(
        DEFAULT_CONFIG.display.lines[0]?.segments
      );
    });

    it("should preserve display lines when setting invalid style via CLI", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      mockFs.existsSync.mockReturnValue(false);
      const config = loadConfigFromCLI(["node", "script", "--style=invalid"]);
      expect(config.display.style).toBe("minimal");
      expect(config.display.lines).toHaveLength(
        DEFAULT_CONFIG.display.lines.length
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid display style")
      );
      consoleSpy.mockRestore();
    });

    it("should load config file with --config= syntax", () => {
      const customConfig = { theme: "nord" as const };
      mockFs.existsSync.mockImplementation(
        (path) => path === "/custom/config.json"
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify(customConfig));

      const config = loadConfigFromCLI([
        "node",
        "script",
        "--config=/custom/config.json",
      ]);
      expect(config.theme).toBe("nord");
    });

    it("should load config file with --config space syntax", () => {
      const customConfig = { theme: "rose-pine" as const };
      mockFs.existsSync.mockImplementation(
        (path) => path === "/custom/config.json"
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify(customConfig));

      const config = loadConfigFromCLI([
        "node",
        "script",
        "--config",
        "/custom/config.json",
      ]);
      expect(config.theme).toBe("rose-pine");
    });

    it("should expand tilde in --config path", () => {
      const customConfig = { theme: "gruvbox" as const };
      mockFs.existsSync.mockImplementation(
        (path) => path === "/home/user/.config/powerline.json"
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify(customConfig));

      const config = loadConfigFromCLI([
        "node",
        "script",
        "--config",
        "~/.config/powerline.json",
      ]);
      expect(config.theme).toBe("gruvbox");
    });
  });

  describe("environment variables", () => {
    beforeEach(() => {
      delete process.env.CLAUDE_POWERLINE_THEME;
      delete process.env.CLAUDE_POWERLINE_STYLE;
    });

    it("should preserve display lines when setting style via environment", () => {
      mockFs.existsSync.mockReturnValue(false);
      process.env.CLAUDE_POWERLINE_STYLE = "powerline";
      const config = loadConfig();
      expect(config.display.style).toBe("powerline");
      expect(config.display.lines).toHaveLength(
        DEFAULT_CONFIG.display.lines.length
      );
    });

    it("should handle capsule style from environment", () => {
      mockFs.existsSync.mockReturnValue(false);
      process.env.CLAUDE_POWERLINE_STYLE = "capsule";
      const config = loadConfig();
      expect(config.display.style).toBe("capsule");
      expect(config.display.lines).toHaveLength(
        DEFAULT_CONFIG.display.lines.length
      );
    });

    it("should handle invalid style from environment", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      mockFs.existsSync.mockReturnValue(false);
      process.env.CLAUDE_POWERLINE_STYLE = "invalid";
      const config = loadConfig();
      expect(config.display.style).toBe("minimal");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid display style")
      );
      consoleSpy.mockRestore();
    });
  });

  describe("configuration precedence", () => {
    beforeEach(() => {
      delete process.env.CLAUDE_POWERLINE_THEME;
      delete process.env.CLAUDE_POWERLINE_STYLE;
    });

    it("should prioritize CLI over environment over file", () => {
      mockFs.existsSync.mockImplementation(
        (p) => p === path.join("/project", ".claude-powerline.json")
      );
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({ theme: "light", display: { style: "minimal" } })
      );
      process.env.CLAUDE_POWERLINE_THEME = "nord";
      process.env.CLAUDE_POWERLINE_STYLE = "powerline";

      const config = loadConfigFromCLI([
        "node",
        "script",
        "--theme=rose-pine",
        "--style=minimal",
      ]);
      expect(config.theme).toBe("rose-pine");
      expect(config.display.style).toBe("minimal");
    });
  });

  describe("invalid config file values", () => {
    beforeEach(() => {
      delete process.env.CLAUDE_POWERLINE_THEME;
      delete process.env.CLAUDE_POWERLINE_STYLE;
    });

    it("should fallback invalid theme in config file to dark", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      mockFs.existsSync.mockImplementation(
        (p) => p === path.join("/project", ".claude-powerline.json")
      );
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({ theme: "invalid-theme" })
      );

      const config = loadConfig();
      expect(config.theme).toBe("dark");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid theme")
      );
      consoleSpy.mockRestore();
    });

    it("should fallback invalid style in config file to minimal", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      mockFs.existsSync.mockImplementation(
        (p) => p === path.join("/project", ".claude-powerline.json")
      );
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({ display: { style: "invalid-style" } })
      );

      const config = loadConfig();
      expect(config.display.style).toBe("minimal");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid display style")
      );
      consoleSpy.mockRestore();
    });

    it("should accept capsule style in config file", () => {
      mockFs.existsSync.mockImplementation(
        (p) => p === path.join("/project", ".claude-powerline.json")
      );
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({ display: { style: "capsule" } })
      );

      const config = loadConfig();
      expect(config.display.style).toBe("capsule");
    });
  });

  describe("grid config validation", () => {
    let stderrSpy: jest.SpyInstance;

    beforeEach(() => {
      stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    });

    afterEach(() => {
      stderrSpy.mockRestore();
    });

    function loadWithGrid(tui: any) {
      mockFs.existsSync.mockImplementation(
        (p) => p === path.join("/project", ".claude-powerline.json")
      );
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({ display: { style: "tui", tui } })
      );
      return loadConfig();
    }

    it("should accept valid grid config", () => {
      const config = loadWithGrid({
        breakpoints: [{
          minWidth: 0,
          areas: ["block session"],
          columns: ["1fr", "1fr"],
          align: ["left", "right"],
        }],
      });
      expect(config.display.tui).toBeDefined();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it("should reject grid config with no breakpoints", () => {
      const config = loadWithGrid({ breakpoints: [] });
      expect(config.display.tui).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("at least one breakpoint"));
    });

    it("should reject grid config with missing breakpoints", () => {
      const config = loadWithGrid({});
      expect(config.display.tui).toBeUndefined();
    });

    it("should reject grid config with negative minWidth", () => {
      const config = loadWithGrid({
        breakpoints: [{ minWidth: -1, areas: ["block"], columns: ["1fr"] }],
      });
      expect(config.display.tui).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("minWidth"));
    });

    it("should reject grid config with column count mismatch", () => {
      const config = loadWithGrid({
        breakpoints: [{
          minWidth: 0,
          areas: ["block session today"],
          columns: ["1fr", "1fr"], // 2 columns but 3 cells
        }],
      });
      expect(config.display.tui).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("cells but expected"));
    });

    it("should reject grid config with unknown segment name", () => {
      const config = loadWithGrid({
        breakpoints: [{
          minWidth: 0,
          areas: ["block unknown_seg"],
          columns: ["1fr", "1fr"],
        }],
      });
      expect(config.display.tui).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("unknown segment"));
    });

    it("should reject grid config with align length mismatch", () => {
      const config = loadWithGrid({
        breakpoints: [{
          minWidth: 0,
          areas: ["block session"],
          columns: ["1fr", "1fr"],
          align: ["left"], // 1 align but 2 columns
        }],
      });
      expect(config.display.tui).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("align length"));
    });

    it("should reject grid config with invalid align value", () => {
      const config = loadWithGrid({
        breakpoints: [{
          minWidth: 0,
          areas: ["block session"],
          columns: ["1fr", "1fr"],
          align: ["left", "middle"],
        }],
      });
      expect(config.display.tui).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("invalid align"));
    });

    it("should reject grid config with invalid column definition", () => {
      const config = loadWithGrid({
        breakpoints: [{
          minWidth: 0,
          areas: ["block session"],
          columns: ["1fr", "minmax(10,1fr)"],
        }],
      });
      expect(config.display.tui).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("invalid column definition"));
    });

    it("should reject grid config with non-contiguous spans", () => {
      const config = loadWithGrid({
        breakpoints: [{
          minWidth: 0,
          areas: ["block session block"], // block is not contiguous
          columns: ["1fr", "1fr", "1fr"],
        }],
      });
      expect(config.display.tui).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("non-contiguous"));
    });

    it("should reject grid config with segment on multiple rows", () => {
      const config = loadWithGrid({
        breakpoints: [{
          minWidth: 0,
          areas: ["block session", "block today"],
          columns: ["1fr", "1fr"],
        }],
      });
      expect(config.display.tui).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("multiple rows"));
    });

    it("should allow . cells and --- divider rows", () => {
      const config = loadWithGrid({
        breakpoints: [{
          minWidth: 0,
          areas: ["block . session", "---", "git . dir"],
          columns: ["1fr", "auto", "1fr"],
        }],
      });
      expect(config.display.tui).toBeDefined();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it("should allow contiguous spans", () => {
      const config = loadWithGrid({
        breakpoints: [{
          minWidth: 0,
          areas: ["context context context"],
          columns: ["1fr", "1fr", "1fr"],
        }],
      });
      expect(config.display.tui).toBeDefined();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it("should accept valid column types: auto, fr, fixed", () => {
      const config = loadWithGrid({
        breakpoints: [{
          minWidth: 0,
          areas: ["block session today"],
          columns: ["auto", "2fr", "20"],
        }],
      });
      expect(config.display.tui).toBeDefined();
      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });
});
