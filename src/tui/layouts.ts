import type { RenderCtx } from "./types";

import { formatCost } from "../utils/formatters";
import { resolveIconVisibility } from "../utils/icon-visibility";
import {
  contentRow,
  divider,
  spreadEven,
  spreadTwo,
  colorize,
} from "./primitives";
import {
  collectMetricSegments,
  collectActivityParts,
  collectWorkspaceParts,
  collectFooterParts,
  formatBlockSegment,
  formatWeeklySegment,
  formatSessionSegment,
  formatTodaySegment,
  resolveSessionCost,
} from "./sections";

// --- Wide layout (80+ cols): metrics on 1 line, workspace+footer on 1 line ---

export function renderWideMetrics(ctx: RenderCtx): void {
  const {
    lines,
    data,
    box,
    contentWidth,
    innerWidth,
    sym,
    config,
    reset,
    colors,
  } = ctx;
  const segments = collectMetricSegments(data, sym, config, reset, colors);
  if (segments.length > 0) {
    lines.push(contentRow(box, spreadEven(segments, contentWidth), innerWidth));
  }
}

export function renderWideBottom(ctx: RenderCtx): void {
  const {
    lines,
    data,
    box,
    contentWidth,
    innerWidth,
    sym,
    config,
    reset,
    colors,
  } = ctx;
  const leftParts = collectWorkspaceParts(data, sym, reset, colors, config);
  const rightParts = collectFooterParts(data, sym, config, reset, colors);

  const leftStr = leftParts.join("  ");
  const rightStr = rightParts.join(" · ");

  if (leftStr || rightStr) {
    lines.push(divider(box, innerWidth));
    lines.push(
      contentRow(box, spreadTwo(leftStr, rightStr, contentWidth), innerWidth),
    );
  }
}

// --- Medium layout (55-79 cols): metrics on 2 lines, workspace and footer separate ---

export function renderMediumMetrics(ctx: RenderCtx): void {
  const {
    lines,
    data,
    box,
    contentWidth,
    innerWidth,
    sym,
    config,
    reset,
    colors,
  } = ctx;
  const line1Parts: string[] = [];
  const line2Parts: string[] = [];

  const showBlockIcon = resolveIconVisibility(config, "block");
  const showWeeklyIcon = resolveIconVisibility(config, "weekly");
  const showTodayIcon = resolveIconVisibility(config, "today");
  const showSessionIcon = resolveIconVisibility(config, "session");

  if (data.blockInfo) {
    line1Parts.push(
      colorize(
        formatBlockSegment(data.blockInfo, sym, config, showBlockIcon),
        colors.blockFg,
        reset,
        colors.blockBold,
      ),
    );
  }
  const sevenDay = data.hookData.rate_limits?.seven_day;
  if (sevenDay) {
    line1Parts.push(
      colorize(
        formatWeeklySegment(sevenDay, sym, showWeeklyIcon),
        colors.weeklyFg,
        reset,
        colors.weeklyBold,
      ),
    );
  }
  if (data.todayInfo) {
    line1Parts.push(
      colorize(
        formatTodaySegment(data.todayInfo, sym, config, showTodayIcon),
        colors.todayFg,
        reset,
        colors.todayBold,
      ),
    );
  }

  if (data.usageInfo) {
    line2Parts.push(
      colorize(
        formatSessionSegment(data.usageInfo, sym, config, showSessionIcon),
        colors.sessionFg,
        reset,
        colors.sessionBold,
      ),
    );
  }
  const activityParts = collectActivityParts(data, sym);
  if (activityParts.length > 0) {
    line2Parts.push(
      colorize(
        activityParts.join(" · "),
        colors.metricsFg,
        reset,
        colors.metricsBold,
      ),
    );
  }

  if (line1Parts.length > 0) {
    lines.push(
      contentRow(box, spreadEven(line1Parts, contentWidth), innerWidth),
    );
  }
  if (line2Parts.length > 0) {
    lines.push(
      contentRow(
        box,
        spreadTwo(line2Parts[0] ?? "", line2Parts[1] ?? "", contentWidth),
        innerWidth,
      ),
    );
  }
}

export function renderMediumBottom(ctx: RenderCtx): void {
  const {
    lines,
    data,
    box,
    contentWidth,
    innerWidth,
    sym,
    config,
    reset,
    colors,
  } = ctx;
  const workspaceParts = collectWorkspaceParts(
    data,
    sym,
    reset,
    colors,
    config,
  );
  if (workspaceParts.length > 0) {
    lines.push(divider(box, innerWidth));
    lines.push(
      contentRow(
        box,
        spreadTwo(
          workspaceParts[0] ?? "",
          workspaceParts[1] ?? "",
          contentWidth,
        ),
        innerWidth,
      ),
    );
  }

  const footerParts = collectFooterParts(data, sym, config, reset, colors);
  if (footerParts.length > 0) {
    lines.push(divider(box, innerWidth));
    lines.push(contentRow(box, footerParts.join(" · "), innerWidth));
  }
}

// --- Narrow layout (<55 cols): everything stacks ---

export function renderNarrowMetrics(ctx: RenderCtx): void {
  const {
    lines,
    data,
    box,
    contentWidth,
    innerWidth,
    sym,
    config,
    reset,
    colors,
  } = ctx;
  const showBlockIcon = resolveIconVisibility(config, "block");
  const showWeeklyIcon = resolveIconVisibility(config, "weekly");
  const showSessionIcon = resolveIconVisibility(config, "session");
  const showTodayIcon = resolveIconVisibility(config, "today");

  if (data.blockInfo) {
    lines.push(
      contentRow(
        box,
        colorize(
          formatBlockSegment(data.blockInfo, sym, config, showBlockIcon),
          colors.blockFg,
          reset,
          colors.blockBold,
        ),
        innerWidth,
      ),
    );
  }
  const narrowSevenDay = data.hookData.rate_limits?.seven_day;
  if (narrowSevenDay) {
    lines.push(
      contentRow(
        box,
        colorize(
          formatWeeklySegment(narrowSevenDay, sym, showWeeklyIcon),
          colors.weeklyFg,
          reset,
          colors.weeklyBold,
        ),
        innerWidth,
      ),
    );
  }

  const sessionAndToday: string[] = [];
  if (data.usageInfo) {
    const sessionCost = resolveSessionCost(data.usageInfo.session, config);
    const sessionText = showSessionIcon
      ? `${sym.session_cost} ${formatCost(sessionCost)}`
      : formatCost(sessionCost);
    sessionAndToday.push(
      colorize(sessionText, colors.sessionFg, reset, colors.sessionBold),
    );
  }
  if (data.todayInfo) {
    const todayText = showTodayIcon
      ? `${sym.today_cost} ${formatCost(data.todayInfo.cost)} today`
      : `${formatCost(data.todayInfo.cost)} today`;
    sessionAndToday.push(
      colorize(todayText, colors.todayFg, reset, colors.todayBold),
    );
  }
  if (sessionAndToday.length > 0) {
    lines.push(
      contentRow(
        box,
        spreadTwo(
          sessionAndToday[0] ?? "",
          sessionAndToday[1] ?? "",
          contentWidth,
        ),
        innerWidth,
      ),
    );
  }
}

export function renderNarrowBottom(ctx: RenderCtx): void {
  const {
    lines,
    data,
    box,
    contentWidth,
    innerWidth,
    sym,
    config,
    reset,
    colors,
  } = ctx;
  const workspaceParts = collectWorkspaceParts(
    data,
    sym,
    reset,
    colors,
    config,
  );
  if (workspaceParts.length > 0) {
    lines.push(divider(box, innerWidth));
    lines.push(
      contentRow(
        box,
        spreadTwo(
          workspaceParts[0] ?? "",
          workspaceParts[1] ?? "",
          contentWidth,
        ),
        innerWidth,
      ),
    );
  }

  const footerParts = collectFooterParts(data, sym, config, reset, colors);
  if (footerParts.length > 0) {
    lines.push(contentRow(box, footerParts.join(" · "), innerWidth));
  }
}
