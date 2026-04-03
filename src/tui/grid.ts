import type {
  GridCell,
  AlignValue,
  TuiGridBreakpoint,
  TuiGridConfig,
  BoxChars,
} from "./types";
import { visibleLength } from "../utils/terminal";
import { truncateAnsi, padRight, padLeft, padCenter } from "./primitives";

export const DIVIDER = "---";
export const EMPTY_CELL = ".";

// Segments whose content is resolved after column widths are known (lateResolve).
// Auto-width measurement must skip these to avoid locking columns to placeholder widths.
export const LATE_RESOLVE_SEGMENTS = new Set([
  "context",
  "context.bar",
  "block.bar",
  "weekly.bar",
]);

function isDividerRow(row: GridCell[]): boolean {
  return row.length === 1 && row[0]!.segment === DIVIDER;
}

function parseFr(colDef: string): number {
  if (!colDef.endsWith("fr")) return 0;
  const fr = parseInt(colDef.replace("fr", ""), 10);
  return !isNaN(fr) && fr > 0 ? fr : 0;
}

function distributeExact(
  total: number,
  targets: number[],
  widths: number[],
): void {
  const base = Math.floor(total / targets.length);
  let extra = total - base * targets.length;
  for (const idx of targets) {
    widths[idx] = widths[idx]! + base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
  }
}

function spanCellWidth(
  colWidths: number[],
  startIdx: number,
  spanSize: number,
  sepWidth: number,
): number {
  let width = 0;
  for (let j = 0; j < spanSize; j++) {
    width += colWidths[startIdx + j] ?? 0;
  }
  if (spanSize > 1) {
    width += (spanSize - 1) * sepWidth;
  }
  return width;
}

export interface GridResult {
  lines: string[];
  panelWidth: number;
}

// --- Breakpoint Selection ---

export function selectBreakpoint(
  breakpoints: TuiGridBreakpoint[],
  panelWidth: number,
): TuiGridBreakpoint {
  let best: TuiGridBreakpoint | undefined;
  for (const bp of breakpoints) {
    if (panelWidth >= bp.minWidth) {
      if (!best || bp.minWidth > best.minWidth) {
        best = bp;
      }
    }
  }
  if (best) return best;

  // Fallback to smallest minWidth
  let smallest = breakpoints[0]!;
  for (let i = 1; i < breakpoints.length; i++) {
    if (breakpoints[i]!.minWidth < smallest.minWidth) {
      smallest = breakpoints[i]!;
    }
  }
  return smallest;
}

// --- Area Parsing ---

export function parseAreas(areas: string[]): GridCell[][] {
  const matrix: GridCell[][] = [];

  for (const row of areas) {
    const trimmed = row.trim();

    // Divider row
    if (trimmed === DIVIDER) {
      matrix.push([{ segment: DIVIDER, spanStart: true, spanSize: 1 }]);
      continue;
    }

    const cells = trimmed.split(/\s+/);
    const rowCells: GridCell[] = [];

    let i = 0;
    while (i < cells.length) {
      const name = cells[i]!;
      let spanSize = 1;

      // Count adjacent cells with the same name
      while (i + spanSize < cells.length && cells[i + spanSize] === name) {
        spanSize++;
      }

      // First cell of the span
      rowCells.push({ segment: name, spanStart: true, spanSize });

      // Continuation cells
      for (let j = 1; j < spanSize; j++) {
        rowCells.push({ segment: name, spanStart: false, spanSize: 0 });
      }

      i += spanSize;
    }

    matrix.push(rowCells);
  }

  return matrix;
}

// --- Matrix Culling ---

export function cullMatrix(
  matrix: GridCell[][],
  resolvedData: Record<string, string>,
): GridCell[][] {
  // Phase 1: Replace cells whose segment has no data with "."
  const processed = matrix.map((row) => {
    if (isDividerRow(row)) return row;

    return row.map((cell) => {
      if (cell.segment === EMPTY_CELL || cell.segment === DIVIDER) return cell;

      const data = resolvedData[cell.segment];
      if (!data) {
        return { segment: EMPTY_CELL, spanStart: true, spanSize: 1 };
      }
      return cell;
    });
  });

  // Phase 2: Re-calculate spans after emptying cells
  // When a span-start cell was emptied, all its continuation cells are already individual "." cells.
  // But when continuation cells were emptied, the span-start needs fixing.
  const respanned = processed.map((row) => {
    if (isDividerRow(row)) return row;

    // Rebuild spans from scratch
    const cells = row.map((c) => c.segment);
    const rebuilt: GridCell[] = [];

    let i = 0;
    while (i < cells.length) {
      const name = cells[i]!;
      let spanSize = 1;

      while (i + spanSize < cells.length && cells[i + spanSize] === name) {
        spanSize++;
      }

      rebuilt.push({ segment: name, spanStart: true, spanSize });
      for (let j = 1; j < spanSize; j++) {
        rebuilt.push({ segment: name, spanStart: false, spanSize: 0 });
      }

      i += spanSize;
    }

    return rebuilt;
  });

  // Phase 3: Remove rows that are entirely "."
  const nonEmpty = respanned.filter((row) => {
    if (isDividerRow(row)) return true;
    return row.some((cell) => cell.segment !== EMPTY_CELL);
  });

  // Phase 4: Collapse adjacent dividers into one, remove leading/trailing dividers
  const cleaned: GridCell[][] = [];
  for (let i = 0; i < nonEmpty.length; i++) {
    const row = nonEmpty[i]!;
    if (!isDividerRow(row)) {
      cleaned.push(row);
      continue;
    }

    // Skip dividers at top
    if (cleaned.length === 0) continue;

    // Collapse adjacent dividers: skip if last pushed row is already a divider
    if (isDividerRow(cleaned[cleaned.length - 1]!)) continue;

    cleaned.push(row);
  }

  // Remove trailing divider
  if (cleaned.length > 0 && isDividerRow(cleaned[cleaned.length - 1]!)) {
    cleaned.pop();
  }

  return cleaned;
}

// --- Column Width Distribution ---

function measureAutoWidths(
  colCount: number,
  matrix: GridCell[][],
  resolvedData: Record<string, string>,
  lateResolveNames?: ReadonlySet<string>,
): number[] {
  const widths = Array.from<number>({ length: colCount }).fill(0);
  for (const row of matrix) {
    if (isDividerRow(row)) continue;
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cell = row[colIdx]!;
      if (!cell.spanStart || cell.spanSize !== 1) continue;
      if (cell.segment === EMPTY_CELL) continue;
      if (colIdx >= colCount) continue;
      if (lateResolveNames?.has(cell.segment)) continue;
      const content = resolvedData[cell.segment] || "";
      const len = visibleLength(content);
      if (len > widths[colIdx]!) {
        widths[colIdx] = len;
      }
    }
  }
  return widths;
}

export function calculateColumnWidths(
  columns: string[],
  matrix: GridCell[][],
  resolvedData: Record<string, string>,
  contentWidth: number,
  separatorWidth: number,
  lateResolveNames?: ReadonlySet<string>,
): number[] {
  const colCount = columns.length;
  const autoWidths = measureAutoWidths(
    colCount,
    matrix,
    resolvedData,
    lateResolveNames,
  );
  const widths = Array.from<number>({ length: colCount }).fill(0);

  // Phase 1: Apply auto widths
  for (let i = 0; i < colCount; i++) {
    if (columns[i] === "auto") {
      widths[i] = autoWidths[i]!;
    }
  }

  // Phase 2: Apply fixed widths
  for (let i = 0; i < colCount; i++) {
    const colDef = columns[i]!;
    if (colDef === "auto") continue;
    if (colDef.endsWith("fr")) continue;

    const fixed = parseInt(colDef, 10);
    if (!isNaN(fixed) && fixed > 0) {
      widths[i] = fixed;
    }
  }

  const totalSepWidth = Math.max(0, colCount - 1) * separatorWidth;
  const usedWidth = widths.reduce((sum, w) => sum + w, 0);
  const remaining = Math.max(0, contentWidth - usedWidth - totalSepWidth);

  let totalFr = 0;
  for (const colDef of columns) totalFr += parseFr(colDef);

  if (totalFr > 0) {
    const perFr = remaining / totalFr;
    const frCols: number[] = [];
    let allocatedFr = 0;
    for (let i = 0; i < colCount; i++) {
      const fr = parseFr(columns[i]!);
      if (fr > 0) {
        const w = Math.floor(perFr * fr);
        widths[i] = w;
        allocatedFr += w;
        frCols.push(i);
      }
    }
    let leftover = remaining - allocatedFr;
    for (let k = 0; leftover > 0 && k < frCols.length; k++) {
      widths[frCols[k]!]! += 1;
      leftover--;
    }
  }

  // Phase 3: Clamp all widths to >= 1
  for (let i = 0; i < colCount; i++) {
    if (widths[i]! < 1) {
      widths[i] = 1;
    }
  }

  return widths;
}

export function solveFitContentLayout(
  columns: string[],
  matrix: GridCell[][],
  resolvedData: Record<string, string>,
  separatorWidth: number,
  horizontalPadding: number,
  lateResolveNames?: ReadonlySet<string>,
): { panelWidth: number; colWidths: number[] } {
  const colCount = columns.length;
  const autoWidths = measureAutoWidths(
    colCount,
    matrix,
    resolvedData,
    lateResolveNames,
  );

  // Seed from intrinsic non-spanning content and fixed widths
  const widths = Array.from<number>({ length: colCount });
  for (let i = 0; i < colCount; i++) {
    const colDef = columns[i]!;
    if (colDef !== "auto" && !colDef.endsWith("fr")) {
      const fixed = parseInt(colDef, 10);
      widths[i] = !isNaN(fixed) && fixed > 0 ? fixed : autoWidths[i]!;
    } else {
      widths[i] = autoWidths[i]!;
    }
  }

  // Expand columns to fit spanning cells
  for (const row of matrix) {
    if (isDividerRow(row)) continue;
    for (let i = 0; i < row.length; i++) {
      const cell = row[i]!;
      if (!cell.spanStart || cell.spanSize <= 1 || cell.segment === EMPTY_CELL)
        continue;

      const content = resolvedData[cell.segment] || "";
      const contentLen = visibleLength(content);
      const sw = spanCellWidth(widths, i, cell.spanSize, separatorWidth);

      if (contentLen > sw) {
        const deficit = contentLen - sw;
        const frCols: number[] = [];
        for (let j = 0; j < cell.spanSize; j++) {
          if (parseFr(columns[i + j]!) > 0) frCols.push(i + j);
        }
        if (frCols.length > 0) {
          distributeExact(deficit, frCols, widths);
        } else {
          const allCols: number[] = [];
          for (let j = 0; j < cell.spanSize; j++) allCols.push(i + j);
          distributeExact(deficit, allCols, widths);
        }
      }
    }
  }

  if (horizontalPadding > 0) {
    let totalFr = 0;
    for (const colDef of columns) totalFr += parseFr(colDef);
    if (totalFr > 0) {
      const padFrCols: number[] = [];
      let padAllocated = 0;
      for (let i = 0; i < colCount; i++) {
        const fr = parseFr(columns[i]!);
        if (fr > 0) {
          const add = Math.floor((horizontalPadding * fr) / totalFr);
          widths[i] = widths[i]! + add;
          padAllocated += add;
          padFrCols.push(i);
        }
      }
      let padLeftover = horizontalPadding - padAllocated;
      for (let k = 0; padLeftover > 0 && k < padFrCols.length; k++) {
        widths[padFrCols[k]!]! += 1;
        padLeftover--;
      }
    }
  }

  // Clamp all widths to >= 1
  for (let i = 0; i < colCount; i++) {
    if (widths[i]! < 1) widths[i] = 1;
  }

  let naturalWidth = 0;
  for (let i = 0; i < colCount; i++) {
    naturalWidth += widths[i]!;
  }

  const totalSepWidth = Math.max(0, colCount - 1) * separatorWidth;
  const borders = 4; // 2 box chars + 2 padding chars
  return {
    panelWidth: naturalWidth + totalSepWidth + borders,
    colWidths: widths,
  };
}

// --- Cell Rendering ---

function alignContent(text: string, width: number, align: AlignValue): string {
  switch (align) {
    case "right":
      return padLeft(text, width);
    case "center":
      return padCenter(text, width);
    case "left":
    default:
      return padRight(text, width);
  }
}

export function renderGridRow(
  row: GridCell[],
  colWidths: number[],
  align: AlignValue[],
  resolvedData: Record<string, string>,
  separator: string,
): string {
  const parts: string[] = [];
  const sepWidth = visibleLength(separator);

  for (let i = 0; i < row.length; i++) {
    const cell = row[i]!;
    if (!cell.spanStart) continue;

    const cellWidth = spanCellWidth(colWidths, i, cell.spanSize, sepWidth);

    if (cell.segment === EMPTY_CELL) {
      parts.push(" ".repeat(cellWidth));
    } else {
      const content = resolvedData[cell.segment] || "";
      const truncated = truncateAnsi(content, cellWidth);
      // Use alignment of the span-start column
      const cellAlign = align[i] || "left";
      parts.push(alignContent(truncated, cellWidth, cellAlign));
    }
  }

  return parts.join(separator);
}

// --- Divider Rendering ---

export function renderGridDivider(
  box: BoxChars,
  innerWidth: number,
  dividerChar?: string,
): string {
  const ch = dividerChar || box.horizontal;
  return box.teeLeft + ch.repeat(innerWidth) + box.teeRight;
}

// --- Main Grid Render ---

export function renderGrid(
  gridConfig: TuiGridConfig,
  resolvedData: Record<string, string>,
  box: BoxChars,
  rawTerminalWidth: number,
  lateResolve?: (segment: string, cellWidth: number) => string | undefined,
): GridResult {
  const minWidth = gridConfig.minWidth ?? 32;
  const maxWidth = gridConfig.maxWidth ?? Infinity;
  const colSep = gridConfig.separator?.column ?? "  ";
  const dividerChar = gridConfig.separator?.divider;
  const sepWidth = visibleLength(colSep);
  const fitContent = gridConfig.fitContent ?? false;
  const hPad = gridConfig.padding?.horizontal ?? 0;

  // Select initial panel width for breakpoint selection
  let panelWidth: number;
  if (fitContent) {
    panelWidth =
      maxWidth !== Infinity
        ? Math.min(rawTerminalWidth, maxWidth)
        : rawTerminalWidth;
  } else {
    const widthReserve = gridConfig.widthReserve ?? 45;
    panelWidth = Math.min(
      maxWidth,
      Math.max(minWidth, rawTerminalWidth - widthReserve),
    );
  }

  // Select breakpoint (based on available width, not final panel width)
  const bp = selectBreakpoint(gridConfig.breakpoints, panelWidth);

  // Parse areas
  const rawMatrix = parseAreas(bp.areas);

  // Cull empty cells/rows
  const matrix = cullMatrix(rawMatrix, resolvedData);

  if (matrix.length === 0) {
    return { lines: [], panelWidth };
  }

  let colWidths: number[];

  // Collect late-resolve segment names (including user-defined templates)
  const lateNames = new Set(LATE_RESOLVE_SEGMENTS);
  if (gridConfig.segments) {
    for (const key of Object.keys(gridConfig.segments)) {
      lateNames.add(key);
    }
  }

  if (fitContent) {
    const solved = solveFitContentLayout(
      bp.columns,
      matrix,
      resolvedData,
      sepWidth,
      hPad,
      lateNames,
    );
    panelWidth = Math.min(maxWidth, Math.max(minWidth, solved.panelWidth));
    colWidths = solved.colWidths;

    // Redistribute surplus (from minWidth or maxWidth clamping) into fr columns
    const surplus = panelWidth - solved.panelWidth;
    if (surplus > 0) {
      let totalFr = 0;
      for (const colDef of bp.columns) totalFr += parseFr(colDef);
      if (totalFr > 0) {
        const frCols: number[] = [];
        let allocated = 0;
        for (let i = 0; i < colWidths.length; i++) {
          const fr = parseFr(bp.columns[i]!);
          if (fr > 0) {
            const add = Math.floor((surplus * fr) / totalFr);
            colWidths[i]! += add;
            allocated += add;
            frCols.push(i);
          }
        }
        let leftover = surplus - allocated;
        for (let k = 0; leftover > 0 && k < frCols.length; k++) {
          colWidths[frCols[k]!]! += 1;
          leftover--;
        }
      }
    }
  } else {
    const innerW = panelWidth - 2;
    const contentW = innerW - 2;
    colWidths = calculateColumnWidths(
      bp.columns,
      matrix,
      resolvedData,
      contentW,
      sepWidth,
      lateNames,
    );
  }

  const innerWidth = panelWidth - 2;
  const contentWidth = innerWidth - 2;

  // Alignment defaults
  const align: AlignValue[] =
    bp.align || bp.columns.map(() => "left" as AlignValue);

  // Late resolve: re-resolve width-dependent segments now that cell widths are known
  if (lateResolve) {
    const seen = new Set<string>();
    for (const row of matrix) {
      if (isDividerRow(row)) continue;
      for (let i = 0; i < row.length; i++) {
        const cell = row[i]!;
        if (
          !cell.spanStart ||
          cell.segment === EMPTY_CELL ||
          cell.segment === DIVIDER
        )
          continue;
        if (seen.has(cell.segment)) continue;
        seen.add(cell.segment);

        const cellWidth = spanCellWidth(colWidths, i, cell.spanSize, sepWidth);
        const content = lateResolve(cell.segment, cellWidth);
        if (content !== undefined) {
          resolvedData[cell.segment] = content;
        }
      }
    }
  }

  // Post-lateResolve culling: segments that resolved to empty after lateResolve
  // can leave orphaned rows and dividers. Re-cull the matrix.
  const finalMatrix = cullMatrix(matrix, resolvedData);

  if (finalMatrix.length === 0) {
    return { lines: [], panelWidth };
  }

  // Render rows
  const lines: string[] = [];
  for (const row of finalMatrix) {
    if (isDividerRow(row)) {
      lines.push(renderGridDivider(box, innerWidth, dividerChar));
    } else {
      const rowStr = renderGridRow(row, colWidths, align, resolvedData, colSep);
      // Wrap in box borders with 1-char padding
      const truncated = truncateAnsi(rowStr, contentWidth);
      const padded = padRight(truncated, contentWidth);
      lines.push(box.vertical + " " + padded + " " + box.vertical);
    }
  }

  return { lines, panelWidth };
}
