import type { PowerlineConfig } from "../config/loader";
import type { TuiData, BoxChars, LayoutMode, RenderCtx, SegmentName } from "./types";

import { SYMBOLS, TEXT_SYMBOLS } from "../utils/constants";
import { contentRow, bottomBorder } from "./primitives";
import { buildTitleBar, buildContextLine, buildContextBar, formatContextParts, resolveSegments, composeTemplate } from "./sections";
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
  const sym = (config.display.charset || "unicode") === "text" ? TEXT_SYMBOLS : SYMBOLS;
  const colors = data.colors;

  // Grid path: when display.tui grid config is present
  if (config.display.tui) {
    const rawWidth = (await getRawTerminalWidth()) ?? 120;
    const gridConfig = config.display.tui;

    // Estimate content width for initial segment resolution (grid will compute final widths)
    const estPanelWidth = Math.max(gridConfig.minWidth ?? MIN_PANEL_WIDTH, rawWidth - (gridConfig.widthReserve ?? 45));
    const estInnerWidth = estPanelWidth - 2;
    const estContentWidth = estInnerWidth - 2;

    const ctx: RenderCtx = { lines: [], data, box, contentWidth: estContentWidth, innerWidth: estInnerWidth, sym, config, reset, colors };
    const resolved = resolveSegments(data, ctx);
    const resolvedData = resolved.data;
    const templates = resolved.templates;

    const lateResolve = (segment: string, cellWidth: number): string | undefined => {
      if (segment === "context") {
        return buildContextLine(data, cellWidth, sym, reset, colors) ?? "";
      }
      if (segment === "context.bar") {
        return buildContextBar(data, cellWidth, sym, reset, colors);
      }
      const tmpl = templates[segment];
      if (tmpl) {
        return composeTemplate(tmpl.items, tmpl.gap, tmpl.justify, cellWidth);
      }
      return undefined;
    };

    const gridResult = renderGrid(gridConfig, resolvedData, box, rawWidth, lateResolve);
    const innerWidth = gridResult.panelWidth - 2;

    const lines: string[] = [];
    lines.push(buildTitleBar(data, box, innerWidth));
    lines.push(...gridResult.lines);
    lines.push(bottomBorder(box, innerWidth));
    return SYNC_START + lines.join("\n") + SYNC_END;
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
  return SYNC_START + lines.join("\n") + SYNC_END;
}
