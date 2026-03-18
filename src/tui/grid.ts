import type { GridCell, AlignValue, TuiGridBreakpoint, TuiGridConfig, SegmentName, BoxChars } from "./types";
import { visibleLength } from "../utils/terminal";
import { truncateAnsi, padRight, padLeft, padCenter } from "./primitives";

// --- Breakpoint Selection ---

export function selectBreakpoint(
  breakpoints: TuiGridBreakpoint[],
  panelWidth: number,
): TuiGridBreakpoint {
  // Sort by minWidth descending
  const sorted = [...breakpoints].sort((a, b) => b.minWidth - a.minWidth);
  for (const bp of sorted) {
    if (panelWidth >= bp.minWidth) {
      return bp;
    }
  }
  // Fallback to last (smallest minWidth)
  return sorted[sorted.length - 1]!;
}

// --- Area Parsing ---

export function parseAreas(areas: string[]): GridCell[][] {
  const matrix: GridCell[][] = [];

  for (const row of areas) {
    const trimmed = row.trim();

    // Divider row
    if (trimmed === "---") {
      matrix.push([{ segment: "---", spanStart: true, spanSize: 1 }]);
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
    // Divider rows pass through
    if (row.length === 1 && row[0]!.segment === "---") {
      return row;
    }

    return row.map((cell) => {
      if (cell.segment === "." || cell.segment === "---") return cell;

      const data = resolvedData[cell.segment];
      if (!data) {
        return { segment: ".", spanStart: true, spanSize: 1 };
      }
      return cell;
    });
  });

  // Phase 2: Re-calculate spans after emptying cells
  // When a span-start cell was emptied, all its continuation cells are already individual "." cells.
  // But when continuation cells were emptied, the span-start needs fixing.
  const respanned = processed.map((row) => {
    if (row.length === 1 && row[0]!.segment === "---") return row;

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
    if (row.length === 1 && row[0]!.segment === "---") return true;
    return row.some((cell) => cell.segment !== ".");
  });

  // Phase 4: Remove orphaned dividers (at top, bottom, or adjacent to another divider)
  const cleaned: GridCell[][] = [];
  for (let i = 0; i < nonEmpty.length; i++) {
    const row = nonEmpty[i]!;
    const isDivider = row.length === 1 && row[0]!.segment === "---";

    if (!isDivider) {
      cleaned.push(row);
      continue;
    }

    // Skip dividers at top or bottom
    if (i === 0 || i === nonEmpty.length - 1) continue;

    // Skip dividers adjacent to another divider
    const prev = nonEmpty[i - 1];
    const next = nonEmpty[i + 1];
    const prevIsDivider = prev && prev.length === 1 && prev[0]!.segment === "---";
    const nextIsDivider = next && next.length === 1 && next[0]!.segment === "---";
    if (prevIsDivider || nextIsDivider) continue;

    cleaned.push(row);
  }

  return cleaned;
}

// --- Column Width Distribution ---

export function calculateColumnWidths(
  columns: string[],
  matrix: GridCell[][],
  resolvedData: Record<string, string>,
  contentWidth: number,
  separatorWidth: number,
): number[] {
  const colCount = columns.length;
  const widths = new Array<number>(colCount).fill(0);

  // Phase 1: Calculate auto widths from non-spanned cells only
  for (const row of matrix) {
    if (row.length === 1 && row[0]!.segment === "---") continue;

    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cell = row[colIdx]!;
      if (!cell.spanStart || cell.spanSize !== 1) continue;
      if (cell.segment === ".") continue;
      if (colIdx >= colCount) continue;

      const colDef = columns[colIdx];
      if (colDef !== "auto") continue;

      const content = resolvedData[cell.segment] || "";
      const len = visibleLength(content);
      if (len > widths[colIdx]!) {
        widths[colIdx] = len;
      }
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

  // Phase 3: Distribute remaining space to fr units
  const totalSepWidth = Math.max(0, colCount - 1) * separatorWidth;
  const usedWidth = widths.reduce((sum, w) => sum + w, 0);
  const remaining = Math.max(0, contentWidth - usedWidth - totalSepWidth);

  let totalFr = 0;
  for (const colDef of columns) {
    if (colDef.endsWith("fr")) {
      const fr = parseInt(colDef.replace("fr", ""), 10);
      if (!isNaN(fr) && fr > 0) {
        totalFr += fr;
      }
    }
  }

  if (totalFr > 0) {
    const perFr = remaining / totalFr;
    for (let i = 0; i < colCount; i++) {
      const colDef = columns[i]!;
      if (colDef.endsWith("fr")) {
        const fr = parseInt(colDef.replace("fr", ""), 10);
        if (!isNaN(fr) && fr > 0) {
          widths[i] = Math.floor(perFr * fr);
        }
      }
    }
  }

  // Phase 4: Clamp all widths to >= 1
  for (let i = 0; i < colCount; i++) {
    if (widths[i]! < 1) {
      widths[i] = 1;
    }
  }

  return widths;
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

    // Calculate cell width (sum of spanned column widths + intermediate separators)
    let cellWidth = 0;
    for (let j = 0; j < cell.spanSize; j++) {
      cellWidth += colWidths[i + j] ?? 0;
    }
    // Add intermediate separator widths for spanned cells
    if (cell.spanSize > 1) {
      cellWidth += (cell.spanSize - 1) * sepWidth;
    }

    if (cell.segment === ".") {
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
): string[] {
  const widthReserve = gridConfig.widthReserve ?? 45;
  const minWidth = gridConfig.minWidth ?? 32;
  const colSep = gridConfig.separator?.column ?? "  ";
  const dividerChar = gridConfig.separator?.divider;
  const sepWidth = visibleLength(colSep);

  const panelWidth = Math.max(minWidth, rawTerminalWidth - widthReserve);
  const innerWidth = panelWidth - 2;
  const contentWidth = innerWidth - 2; // 1 char padding each side

  // Select breakpoint
  const bp = selectBreakpoint(gridConfig.breakpoints, panelWidth);

  // Parse areas
  const rawMatrix = parseAreas(bp.areas);

  // Cull empty cells/rows
  const matrix = cullMatrix(rawMatrix, resolvedData);

  if (matrix.length === 0) {
    return [];
  }

  // Column widths
  const colWidths = calculateColumnWidths(
    bp.columns,
    matrix,
    resolvedData,
    contentWidth,
    sepWidth,
  );

  // Alignment defaults
  const align: AlignValue[] = bp.align || bp.columns.map(() => "left" as AlignValue);

  // Late resolve: re-resolve width-dependent segments now that cell widths are known
  if (lateResolve) {
    const seen = new Set<string>();
    for (const row of matrix) {
      if (row.length === 1 && row[0]!.segment === "---") continue;
      for (let i = 0; i < row.length; i++) {
        const cell = row[i]!;
        if (!cell.spanStart || cell.segment === "." || cell.segment === "---") continue;
        if (seen.has(cell.segment)) continue;
        seen.add(cell.segment);

        let cellWidth = 0;
        for (let j = 0; j < cell.spanSize; j++) {
          cellWidth += colWidths[i + j] ?? 0;
        }
        if (cell.spanSize > 1) {
          cellWidth += (cell.spanSize - 1) * sepWidth;
        }

        const content = lateResolve(cell.segment, cellWidth);
        if (content !== undefined) {
          resolvedData[cell.segment] = content;
        }
      }
    }
  }

  // Render rows
  const lines: string[] = [];
  for (const row of matrix) {
    const isDivider = row.length === 1 && row[0]!.segment === "---";

    if (isDivider) {
      lines.push(renderGridDivider(box, innerWidth, dividerChar));
    } else {
      const rowStr = renderGridRow(row, colWidths, align, resolvedData, colSep);
      // Wrap in box borders with 1-char padding
      const truncated = truncateAnsi(rowStr, contentWidth);
      const padded = padRight(truncated, contentWidth);
      lines.push(box.vertical + " " + padded + " " + box.vertical);
    }
  }

  return lines;
}
