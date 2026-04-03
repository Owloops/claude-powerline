import type { PowerlineConfig } from "../config/loader";
import type { TuiData, BoxChars, LayoutMode, RenderCtx } from "./types";

import { SYMBOLS, TEXT_SYMBOLS, BOX_PRESETS } from "../utils/constants";
import { contentRow, bottomBorder } from "./primitives";
import {
  buildTitleBar,
  buildContextLine,
  buildContextBar,
  buildBlockBar,
  buildWeeklyBar,
  resolveSegments,
  composeTemplate,
  resolveTitleToken,
} from "./sections";
import {
  renderWideMetrics,
  renderWideBottom,
  renderMediumMetrics,
  renderMediumBottom,
  renderNarrowMetrics,
  renderNarrowBottom,
} from "./layouts";
import { renderGrid } from "./grid";
import { getRawTerminalWidth } from "../utils/terminal";

// Synchronized Output (DEC mode 2026): prevents tearing on multi-line renders.
// Terminals that don't support it silently ignore these sequences.
const SYNC_START = "\x1b[?2026h";
const SYNC_END = "\x1b[?2026l";

// No-op ANSI reset prepended to each line to prevent leading whitespace stripping.
// Claude Code's status line renderer strips leading spaces, but ANSI sequences at the
// start of a line protect subsequent whitespace from being trimmed.
const WS_GUARD = "\x1b[0m";

const MIN_PANEL_WIDTH = 32;
const WIDE_THRESHOLD = 80;
const MEDIUM_THRESHOLD = 55;

function getLayoutMode(panelWidth: number): LayoutMode {
  if (panelWidth >= WIDE_THRESHOLD) {
    return "wide";
  }
  if (panelWidth >= MEDIUM_THRESHOLD) {
    return "medium";
  }
  return "narrow";
}

function calculatePanelWidth(terminalWidth: number | null): number {
  if (terminalWidth && terminalWidth > 0) {
    return Math.max(MIN_PANEL_WIDTH, terminalWidth);
  }
  return 80;
}

export async function renderTuiPanel(
  data: TuiData,
  box: BoxChars,
  reset: string,
  terminalWidth: number | null,
  config: PowerlineConfig,
): Promise<string> {
  const sym =
    (config.display.charset || "unicode") === "text" ? TEXT_SYMBOLS : SYMBOLS;
  const colors = data.colors;

  // Grid path: when display.tui grid config is present
  if (config.display.tui) {
    const gridConfig = config.display.tui;
    const rawWidth = gridConfig.terminalWidth ?? getRawTerminalWidth() ?? 120;

    // Merge box character overrides with charset defaults
    // Resolve box preset name or merge partial overrides with charset defaults
    let mergedBox: BoxChars;
    if (typeof gridConfig.box === "string") {
      mergedBox = BOX_PRESETS[gridConfig.box] ?? box;
    } else {
      mergedBox = gridConfig.box ? { ...box, ...gridConfig.box } : box;
    }

    // Estimate content width for initial segment resolution (grid will compute final widths)
    const estPanelWidth = Math.max(
      gridConfig.minWidth ?? MIN_PANEL_WIDTH,
      rawWidth - (gridConfig.widthReserve ?? 45),
    );
    const estInnerWidth = estPanelWidth - 2;
    const estContentWidth = estInnerWidth - 2;

    const ctx: RenderCtx = {
      lines: [],
      data,
      box: mergedBox,
      contentWidth: estContentWidth,
      innerWidth: estInnerWidth,
      sym,
      config,
      reset,
      colors,
    };
    const resolved = resolveSegments(data, ctx);
    const resolvedData = resolved.data;
    const templates = resolved.templates;

    const pf = colors.partFg;
    const lateResolve = (
      segment: string,
      cellWidth: number,
    ): string | undefined => {
      if (segment === "context") {
        return buildContextLine(data, cellWidth, sym, reset, colors) ?? "";
      }
      if (segment === "context.bar") {
        return buildContextBar(data, cellWidth, sym, reset, colors, pf);
      }
      if (segment === "block.bar") {
        return buildBlockBar(data, cellWidth, sym, reset, colors, config, pf);
      }
      if (segment === "weekly.bar") {
        return buildWeeklyBar(data, cellWidth, sym, reset, colors, pf);
      }
      const tmpl = templates[segment];
      if (tmpl) {
        return composeTemplate(tmpl.items, tmpl.gap, tmpl.justify, cellWidth);
      }
      return undefined;
    };

    const gridResult = renderGrid(
      gridConfig,
      resolvedData,
      mergedBox,
      rawWidth,
      lateResolve,
    );
    const innerWidth = gridResult.panelWidth - 2;

    const footerLeft = gridConfig.footer?.left
      ? resolveTitleToken(gridConfig.footer.left, data, resolvedData)
      : undefined;
    const footerRight = gridConfig.footer?.right
      ? resolveTitleToken(gridConfig.footer.right, data, resolvedData)
      : undefined;

    const lines: string[] = [];
    lines.push(
      buildTitleBar(
        data,
        mergedBox,
        innerWidth,
        gridConfig.title,
        resolvedData,
      ),
    );
    lines.push(...gridResult.lines);
    lines.push(bottomBorder(mergedBox, innerWidth, footerLeft, footerRight));
    return SYNC_START + lines.map((l) => WS_GUARD + l).join("\n") + SYNC_END;
  }

  // Hardcoded path: existing layout system
  const panelWidth = calculatePanelWidth(terminalWidth);
  const innerWidth = panelWidth - 2;
  const contentWidth = innerWidth - 2;
  const mode = getLayoutMode(panelWidth);

  const lines: string[] = [];

  lines.push(buildTitleBar(data, box, innerWidth));

  const contextLine = buildContextLine(data, contentWidth, sym, reset, colors);
  if (contextLine) {
    lines.push(contentRow(box, contextLine, innerWidth));
  }

  const ctx: RenderCtx = {
    lines,
    data,
    box,
    contentWidth,
    innerWidth,
    sym,
    config,
    reset,
    colors,
  };

  if (mode === "wide") {
    renderWideMetrics(ctx);
    renderWideBottom(ctx);
  } else if (mode === "medium") {
    renderMediumMetrics(ctx);
    renderMediumBottom(ctx);
  } else {
    renderNarrowMetrics(ctx);
    renderNarrowBottom(ctx);
  }

  lines.push(bottomBorder(box, innerWidth));
  return SYNC_START + lines.map((l) => WS_GUARD + l).join("\n") + SYNC_END;
}
