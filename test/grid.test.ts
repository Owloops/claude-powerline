import {
  parseAreas,
  cullMatrix,
  calculateColumnWidths,
  renderGridRow,
  renderGridDivider,
  renderGrid,
  selectBreakpoint,
} from "../src/tui/grid";
import type { GridCell, AlignValue, TuiGridConfig, BoxChars } from "../src/tui/types";
import { BOX_CHARS } from "../src/utils/constants";
import { visibleLength } from "../src/utils/terminal";

// --- parseAreas ---

describe("parseAreas", () => {
  it("should parse a single-column layout", () => {
    const matrix = parseAreas(["context", "block", "session"]);
    expect(matrix).toHaveLength(3);
    expect(matrix[0]).toEqual([{ segment: "context", spanStart: true, spanSize: 1 }]);
    expect(matrix[1]).toEqual([{ segment: "block", spanStart: true, spanSize: 1 }]);
    expect(matrix[2]).toEqual([{ segment: "session", spanStart: true, spanSize: 1 }]);
  });

  it("should parse multi-column rows", () => {
    const matrix = parseAreas(["block session today"]);
    expect(matrix).toHaveLength(1);
    expect(matrix[0]).toEqual([
      { segment: "block", spanStart: true, spanSize: 1 },
      { segment: "session", spanStart: true, spanSize: 1 },
      { segment: "today", spanStart: true, spanSize: 1 },
    ]);
  });

  it("should detect horizontal spans", () => {
    const matrix = parseAreas(["context context context"]);
    expect(matrix).toHaveLength(1);
    expect(matrix[0]).toEqual([
      { segment: "context", spanStart: true, spanSize: 3 },
      { segment: "context", spanStart: false, spanSize: 0 },
      { segment: "context", spanStart: false, spanSize: 0 },
    ]);
  });

  it("should detect partial spans", () => {
    const matrix = parseAreas(["context context block"]);
    expect(matrix).toHaveLength(1);
    const row = matrix[0]!;
    expect(row[0]).toEqual({ segment: "context", spanStart: true, spanSize: 2 });
    expect(row[1]).toEqual({ segment: "context", spanStart: false, spanSize: 0 });
    expect(row[2]).toEqual({ segment: "block", spanStart: true, spanSize: 1 });
  });

  it("should handle empty cells (.)", () => {
    const matrix = parseAreas(["git . dir"]);
    expect(matrix).toHaveLength(1);
    expect(matrix[0]).toEqual([
      { segment: "git", spanStart: true, spanSize: 1 },
      { segment: ".", spanStart: true, spanSize: 1 },
      { segment: "dir", spanStart: true, spanSize: 1 },
    ]);
  });

  it("should handle divider rows (---)", () => {
    const matrix = parseAreas(["block session", "---", "git dir"]);
    expect(matrix).toHaveLength(3);
    expect(matrix[1]).toEqual([{ segment: "---", spanStart: true, spanSize: 1 }]);
  });

  it("should handle extra whitespace in row strings", () => {
    const matrix = parseAreas(["  block   session   today  "]);
    expect(matrix).toHaveLength(1);
    expect(matrix[0]!.length).toBe(3);
    expect(matrix[0]![0]!.segment).toBe("block");
    expect(matrix[0]![1]!.segment).toBe("session");
    expect(matrix[0]![2]!.segment).toBe("today");
  });

  it("should handle mixed spans and non-spans in a row", () => {
    const matrix = parseAreas(["context context . block block"]);
    const row = matrix[0]!;
    expect(row).toHaveLength(5);
    expect(row[0]).toEqual({ segment: "context", spanStart: true, spanSize: 2 });
    expect(row[1]).toEqual({ segment: "context", spanStart: false, spanSize: 0 });
    expect(row[2]).toEqual({ segment: ".", spanStart: true, spanSize: 1 });
    expect(row[3]).toEqual({ segment: "block", spanStart: true, spanSize: 2 });
    expect(row[4]).toEqual({ segment: "block", spanStart: false, spanSize: 0 });
  });

  it("should handle a full grid template", () => {
    const matrix = parseAreas([
      "context context context",
      "block   session today",
      "---",
      "git     .       dir",
    ]);
    expect(matrix).toHaveLength(4);
    // context spans 3
    expect(matrix[0]![0]!.spanSize).toBe(3);
    // block/session/today are individual
    expect(matrix[1]![0]!.segment).toBe("block");
    expect(matrix[1]![1]!.segment).toBe("session");
    expect(matrix[1]![2]!.segment).toBe("today");
    // divider
    expect(matrix[2]![0]!.segment).toBe("---");
    // git . dir
    expect(matrix[3]![0]!.segment).toBe("git");
    expect(matrix[3]![1]!.segment).toBe(".");
    expect(matrix[3]![2]!.segment).toBe("dir");
  });
});

// --- cullMatrix ---

describe("cullMatrix", () => {
  it("should replace cells with no data with '.'", () => {
    const matrix = parseAreas(["block session today"]);
    const data = { block: "B", session: "", today: "T" };
    const result = cullMatrix(matrix, data);
    expect(result).toHaveLength(1);
    expect(result[0]![0]!.segment).toBe("block");
    expect(result[0]![1]!.segment).toBe(".");
    expect(result[0]![2]!.segment).toBe("today");
  });

  it("should remove rows that become entirely empty", () => {
    const matrix = parseAreas(["block", "session", "today"]);
    const data = { block: "B", session: "", today: "T" };
    const result = cullMatrix(matrix, data);
    expect(result).toHaveLength(2);
    expect(result[0]![0]!.segment).toBe("block");
    expect(result[1]![0]!.segment).toBe("today");
  });

  it("should remove orphaned dividers at top", () => {
    const matrix = parseAreas(["---", "block"]);
    const data = { block: "B" };
    const result = cullMatrix(matrix, data);
    expect(result).toHaveLength(1);
    expect(result[0]![0]!.segment).toBe("block");
  });

  it("should remove orphaned dividers at bottom", () => {
    const matrix = parseAreas(["block", "---"]);
    const data = { block: "B" };
    const result = cullMatrix(matrix, data);
    expect(result).toHaveLength(1);
    expect(result[0]![0]!.segment).toBe("block");
  });

  it("should remove orphaned dividers when adjacent rows collapse", () => {
    const matrix = parseAreas(["block", "---", "session"]);
    const data = { block: "", session: "" };
    const result = cullMatrix(matrix, data);
    expect(result).toHaveLength(0);
  });

  it("should keep dividers between content rows", () => {
    const matrix = parseAreas(["block", "---", "session"]);
    const data = { block: "B", session: "S" };
    const result = cullMatrix(matrix, data);
    expect(result).toHaveLength(3);
    expect(result[0]![0]!.segment).toBe("block");
    expect(result[1]![0]!.segment).toBe("---");
    expect(result[2]![0]!.segment).toBe("session");
  });

  it("should remove all consecutive dividers (both adjacent to each other)", () => {
    const matrix = parseAreas(["block", "---", "---", "session"]);
    const data = { block: "B", session: "S" };
    const result = cullMatrix(matrix, data);
    // Both dividers are adjacent to another divider, so both are removed
    const dividers = result.filter(r => r[0]!.segment === "---");
    expect(dividers).toHaveLength(0);
    expect(result).toHaveLength(2); // just block and session
  });

  it("should handle spans becoming empty", () => {
    const matrix = parseAreas(["context context context"]);
    const data = { context: "" };
    const result = cullMatrix(matrix, data);
    expect(result).toHaveLength(0);
  });

  it("should handle complex collapse scenario", () => {
    const matrix = parseAreas([
      "context context context",
      "block   session today",
      "---",
      "git     .       dir",
      "version .       metrics",
    ]);
    // git, version, and metrics have no data
    const data: Record<string, string> = {
      context: "ctx",
      block: "blk",
      session: "ses",
      today: "tod",
      git: "",
      dir: "dir_val",
      version: "",
      metrics: "",
    };
    const result = cullMatrix(matrix, data);
    // context row stays, block/session/today row stays, divider stays
    // git row: git empty -> ". . dir" -> has content -> stays
    // version row: all empty -> removed
    expect(result.some(r => r.some(c => c.segment === "version"))).toBe(false);
  });

  it("should preserve '.' cells as-is", () => {
    const matrix = parseAreas(["git . dir"]);
    const data = { git: "G", dir: "D" };
    const result = cullMatrix(matrix, data);
    expect(result[0]![1]!.segment).toBe(".");
  });

  it("should rebuild spans after partial emptying", () => {
    // If "context context block" has context empty, result should be ". . block"
    const matrix = parseAreas(["context context block"]);
    const data = { context: "", block: "B" };
    const result = cullMatrix(matrix, data);
    expect(result).toHaveLength(1);
    // The two "." cells should be merged into a span
    expect(result[0]![0]!.segment).toBe(".");
    expect(result[0]![0]!.spanStart).toBe(true);
    expect(result[0]![0]!.spanSize).toBe(2);
    expect(result[0]![2]!.segment).toBe("block");
  });
});

// --- calculateColumnWidths ---

describe("calculateColumnWidths", () => {
  it("should distribute fr units evenly", () => {
    const matrix = parseAreas(["block session"]);
    const data = { block: "B", session: "S" };
    const widths = calculateColumnWidths(["1fr", "1fr"], matrix, data, 80, 2);
    // 80 content width - 2 sep = 78, split evenly
    expect(widths[0]).toBe(39);
    expect(widths[1]).toBe(39);
  });

  it("should distribute fr units proportionally", () => {
    const matrix = parseAreas(["block session"]);
    const data = { block: "B", session: "S" };
    const widths = calculateColumnWidths(["2fr", "1fr"], matrix, data, 90, 2);
    // 90 - 2 sep = 88, 2fr gets 2/3, 1fr gets 1/3
    expect(widths[0]).toBe(58); // floor(88 * 2/3)
    expect(widths[1]).toBe(29); // floor(88 * 1/3)
  });

  it("should handle auto sizing from non-spanned content", () => {
    const matrix = parseAreas(["block session", "git dir"]);
    const data = { block: "BLOCK", session: "SESSION", git: "GIT", dir: "DIRECTORY" };
    const widths = calculateColumnWidths(["auto", "auto"], matrix, data, 80, 2);
    // Auto sizes: col0 = max(5, 3) = 5, col1 = max(7, 9) = 9
    expect(widths[0]).toBe(5);
    expect(widths[1]).toBe(9);
  });

  it("should handle fixed column widths", () => {
    const matrix = parseAreas(["block session"]);
    const data = { block: "B", session: "S" };
    const widths = calculateColumnWidths(["20", "1fr"], matrix, data, 80, 2);
    // Fixed 20 + sep 2 = 22 used, 58 remaining for 1fr
    expect(widths[0]).toBe(20);
    expect(widths[1]).toBe(58);
  });

  it("should handle mixed auto/fr/fixed", () => {
    const matrix = parseAreas(["block session today"]);
    const data = { block: "BLOCK", session: "SES", today: "TODAY" };
    const widths = calculateColumnWidths(["1fr", "auto", "1fr"], matrix, data, 80, 2);
    // Auto col1 = 3 (SES)
    // sep total = 2 * 2 = 4
    // remaining for fr = 80 - 3 - 4 = 73, each fr gets 36
    expect(widths[1]).toBe(3);
    expect(widths[0]).toBe(36);
    expect(widths[2]).toBe(36);
  });

  it("should ignore spanned cells for auto width", () => {
    // context spans all 3 columns, block/session/today are normal
    const matrix = parseAreas(["context context context", "block session today"]);
    const data = {
      context: "A very long context string that would be wide",
      block: "BLK",
      session: "SES",
      today: "TOD",
    };
    const widths = calculateColumnWidths(["auto", "auto", "auto"], matrix, data, 80, 2);
    // Auto should use only non-spanned cells: col0=3, col1=3, col2=3
    expect(widths[0]).toBe(3);
    expect(widths[1]).toBe(3);
    expect(widths[2]).toBe(3);
  });

  it("should clamp widths to minimum 1", () => {
    const matrix = parseAreas(["block session"]);
    const data = { block: "", session: "" };
    const widths = calculateColumnWidths(["auto", "auto"], matrix, data, 10, 2);
    expect(widths[0]).toBeGreaterThanOrEqual(1);
    expect(widths[1]).toBeGreaterThanOrEqual(1);
  });

  it("should handle zero remaining space for fr", () => {
    const matrix = parseAreas(["block session"]);
    const data = { block: "B", session: "S" };
    // Fixed widths consume everything
    const widths = calculateColumnWidths(["40", "40"], matrix, data, 80, 2);
    expect(widths[0]).toBe(40);
    expect(widths[1]).toBe(40);
  });

  it("should handle separator width correctly", () => {
    const matrix = parseAreas(["block session today"]);
    const data = { block: "B", session: "S", today: "T" };
    // 3 columns = 2 separators, each 3 chars wide
    const widths = calculateColumnWidths(["1fr", "1fr", "1fr"], matrix, data, 60, 3);
    // 60 - 6 sep = 54, each fr gets 18
    expect(widths[0]).toBe(18);
    expect(widths[1]).toBe(18);
    expect(widths[2]).toBe(18);
  });
});

// --- selectBreakpoint ---

describe("selectBreakpoint", () => {
  const breakpoints = [
    { minWidth: 80, areas: ["wide"], columns: ["1fr"], align: ["left" as AlignValue] },
    { minWidth: 55, areas: ["medium"], columns: ["1fr"], align: ["left" as AlignValue] },
    { minWidth: 0, areas: ["narrow"], columns: ["1fr"], align: ["left" as AlignValue] },
  ];

  it("should select wide breakpoint for large panels", () => {
    expect(selectBreakpoint(breakpoints, 100).areas[0]).toBe("wide");
  });

  it("should select exact match", () => {
    expect(selectBreakpoint(breakpoints, 80).areas[0]).toBe("wide");
  });

  it("should select medium breakpoint for mid-size panels", () => {
    expect(selectBreakpoint(breakpoints, 65).areas[0]).toBe("medium");
  });

  it("should select narrow breakpoint for small panels", () => {
    expect(selectBreakpoint(breakpoints, 30).areas[0]).toBe("narrow");
  });

  it("should select the smallest breakpoint as fallback", () => {
    expect(selectBreakpoint(breakpoints, 0).areas[0]).toBe("narrow");
  });

  it("should handle unsorted breakpoints", () => {
    const unsorted = [
      { minWidth: 0, areas: ["narrow"], columns: ["1fr"] },
      { minWidth: 80, areas: ["wide"], columns: ["1fr"] },
      { minWidth: 55, areas: ["medium"], columns: ["1fr"] },
    ];
    expect(selectBreakpoint(unsorted, 70).areas[0]).toBe("medium");
  });
});

// --- renderGridRow ---

describe("renderGridRow", () => {
  it("should render a simple row with left alignment", () => {
    const row: GridCell[] = [
      { segment: "block", spanStart: true, spanSize: 1 },
      { segment: "session", spanStart: true, spanSize: 1 },
    ];
    const data = { block: "BLK", session: "SES" };
    const result = renderGridRow(row, [10, 10], ["left", "left"], data, "  ");
    // "BLK" + 7 spaces + "  " separator + "SES" + 7 spaces = 22 chars
    expect(result).toBe("BLK" + " ".repeat(7) + "  " + "SES" + " ".repeat(7));
  });

  it("should render right-aligned cells", () => {
    const row: GridCell[] = [
      { segment: "block", spanStart: true, spanSize: 1 },
    ];
    const data = { block: "BLK" };
    const result = renderGridRow(row, [10], ["right"], data, "  ");
    expect(result).toBe("       BLK");
  });

  it("should render center-aligned cells", () => {
    const row: GridCell[] = [
      { segment: "block", spanStart: true, spanSize: 1 },
    ];
    const data = { block: "BLK" };
    const result = renderGridRow(row, [10], ["center"], data, "  ");
    // 10 - 3 = 7 padding, 3 left + 4 right
    expect(result).toBe("   BLK    ");
  });

  it("should render spanned cells with combined width", () => {
    const row: GridCell[] = [
      { segment: "context", spanStart: true, spanSize: 3 },
      { segment: "context", spanStart: false, spanSize: 0 },
      { segment: "context", spanStart: false, spanSize: 0 },
    ];
    const data = { context: "CTX" };
    // 3 cols of 10 + 2 intermediate separators of 2 = 34
    const result = renderGridRow(row, [10, 10, 10], ["left", "left", "left"], data, "  ");
    expect(result).toBe("CTX" + " ".repeat(31));
  });

  it("should render empty cells as spaces", () => {
    const row: GridCell[] = [
      { segment: "git", spanStart: true, spanSize: 1 },
      { segment: ".", spanStart: true, spanSize: 1 },
      { segment: "dir", spanStart: true, spanSize: 1 },
    ];
    const data = { git: "GIT", dir: "DIR" };
    const result = renderGridRow(row, [10, 10, 10], ["left", "left", "left"], data, "  ");
    expect(result).toContain("GIT");
    expect(result).toContain("DIR");
    // "GIT" + 7 spaces + "  " sep + 10 spaces (empty) + "  " sep + "DIR" + 7 spaces
    expect(result).toBe("GIT" + " ".repeat(7) + "  " + " ".repeat(10) + "  " + "DIR" + " ".repeat(7));
  });

  it("should truncate content that exceeds cell width", () => {
    const row: GridCell[] = [
      { segment: "block", spanStart: true, spanSize: 1 },
    ];
    const data = { block: "VERY LONG CONTENT" };
    const result = renderGridRow(row, [8], ["left"], data, "  ");
    // Should be truncated to 8 visible chars with ellipsis
    expect(visibleLength(result)).toBeLessThanOrEqual(8);
    expect(result).toContain("…");
  });
});

// --- renderGridDivider ---

describe("renderGridDivider", () => {
  it("should render a divider line with default box character", () => {
    const result = renderGridDivider(BOX_CHARS, 20);
    expect(result).toBe("├" + "─".repeat(20) + "┤");
  });

  it("should render a divider line with custom divider character", () => {
    const result = renderGridDivider(BOX_CHARS, 20, "=");
    expect(result).toBe("├" + "=".repeat(20) + "┤");
  });
});

// --- renderGrid (full pipeline) ---

describe("renderGrid", () => {
  const box = BOX_CHARS;

  it("should render a complete grid", () => {
    const gridConfig: TuiGridConfig = {
      widthReserve: 0,
      breakpoints: [{
        minWidth: 0,
        areas: [
          "block   session today",
          "---",
          "git     .       dir",
        ],
        columns: ["1fr", "auto", "1fr"],
        align: ["left", "left", "right"],
      }],
    };
    const data: Record<string, string> = {
      block: "BLK",
      session: "SES",
      today: "TOD",
      git: "GIT",
      dir: "DIR",
    };
    const lines = renderGrid(gridConfig, data, box, 80);
    expect(lines.length).toBeGreaterThan(0);
    // Should have content rows and a divider
    const dividerLines = lines.filter(l => l.includes("├") && l.includes("┤") && l.includes("─"));
    expect(dividerLines.length).toBe(1);
  });

  it("should return empty array when all segments are empty", () => {
    const gridConfig: TuiGridConfig = {
      widthReserve: 0,
      breakpoints: [{
        minWidth: 0,
        areas: ["block session"],
        columns: ["1fr", "1fr"],
      }],
    };
    const data: Record<string, string> = { block: "", session: "" };
    const lines = renderGrid(gridConfig, data, box, 80);
    expect(lines).toHaveLength(0);
  });

  it("should select correct breakpoint based on panel width", () => {
    const gridConfig: TuiGridConfig = {
      widthReserve: 0,
      breakpoints: [
        {
          minWidth: 80,
          areas: ["block session today"],
          columns: ["1fr", "1fr", "1fr"],
        },
        {
          minWidth: 0,
          areas: ["block", "session", "today"],
          columns: ["1fr"],
        },
      ],
    };
    const data: Record<string, string> = { block: "B", session: "S", today: "T" };

    // Wide: 3 columns -> 1 content row
    const wideLines = renderGrid(gridConfig, data, box, 100);
    // Narrow: 1 column -> 3 content rows
    const narrowLines = renderGrid(gridConfig, data, box, 50);
    expect(narrowLines.length).toBeGreaterThan(wideLines.length);
  });

  it("should respect widthReserve", () => {
    const gridConfig: TuiGridConfig = {
      widthReserve: 45,
      breakpoints: [{
        minWidth: 0,
        areas: ["block"],
        columns: ["1fr"],
      }],
    };
    const data: Record<string, string> = { block: "B" };
    const lines = renderGrid(gridConfig, data, box, 120);
    // Panel width = max(32, 120 - 45) = 75
    // Each line should have box chars: "│ content │"
    // Line width = panelWidth = 75
    for (const line of lines) {
      if (!line.includes("├")) {
        expect(line.startsWith("│")).toBe(true);
        expect(line.endsWith("│")).toBe(true);
      }
    }
  });

  it("should respect minWidth", () => {
    const gridConfig: TuiGridConfig = {
      widthReserve: 200, // Huge reserve
      minWidth: 40,
      breakpoints: [{
        minWidth: 0,
        areas: ["block"],
        columns: ["1fr"],
      }],
    };
    const data: Record<string, string> = { block: "B" };
    const lines = renderGrid(gridConfig, data, box, 50);
    // Panel width = max(40, 50 - 200) = max(40, -150) = 40
    expect(lines.length).toBeGreaterThan(0);
  });

  it("should auto-collapse empty rows and remove orphaned dividers", () => {
    const gridConfig: TuiGridConfig = {
      widthReserve: 0,
      breakpoints: [{
        minWidth: 0,
        areas: [
          "block",
          "---",
          "session",
        ],
        columns: ["1fr"],
      }],
    };
    // session is empty, so its row collapses + divider becomes orphaned
    const data: Record<string, string> = { block: "B", session: "" };
    const lines = renderGrid(gridConfig, data, box, 80);
    // Should only have the block row
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("B");
    // No divider
    expect(lines.some(l => l.includes("├"))).toBe(false);
  });

  it("should use custom column separator", () => {
    const gridConfig: TuiGridConfig = {
      widthReserve: 0,
      separator: { column: " | " },
      breakpoints: [{
        minWidth: 0,
        areas: ["block session"],
        columns: ["1fr", "1fr"],
      }],
    };
    const data: Record<string, string> = { block: "BLK", session: "SES" };
    const lines = renderGrid(gridConfig, data, box, 80);
    // The content row should contain the separator
    const contentLine = lines.find(l => l.includes("BLK"));
    expect(contentLine).toContain(" | ");
  });

  it("should default alignment to left when align is omitted", () => {
    const gridConfig: TuiGridConfig = {
      widthReserve: 0,
      breakpoints: [{
        minWidth: 0,
        areas: ["block"],
        columns: ["1fr"],
        // no align specified
      }],
    };
    const data: Record<string, string> = { block: "BLK" };
    const lines = renderGrid(gridConfig, data, box, 80);
    const contentLine = lines[0]!;
    // Content should be left-aligned (starts with box + space + content)
    expect(contentLine).toMatch(/^│ BLK/);
  });

  it("should use custom divider character from separator config", () => {
    const gridConfig: TuiGridConfig = {
      widthReserve: 0,
      separator: { divider: "=" },
      breakpoints: [{
        minWidth: 0,
        areas: ["block", "---", "session"],
        columns: ["1fr"],
      }],
    };
    const data: Record<string, string> = { block: "B", session: "S" };
    const lines = renderGrid(gridConfig, data, box, 80);
    const dividerLine = lines.find(l => l.includes("├") && l.includes("┤"));
    expect(dividerLine).toBeDefined();
    expect(dividerLine).toContain("=");
    expect(dividerLine).not.toContain("─");
  });
});

// --- Config Validation (via loadConfig) ---

describe("validateGridConfig (via loadConfig)", () => {
  // We test the validateGridConfig function indirectly via loadConfig
  // since it's not exported. We import loadConfig and provide grid configs.

  // Note: loadConfig mocking is done in config.test.ts, but we can test
  // the validation function directly by importing it.
  // Since validateGridConfig is not exported, we test it through integration.
});
