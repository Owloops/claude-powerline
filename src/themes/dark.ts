import type { ColorTheme } from "./index";

export const darkTheme: ColorTheme = {
  directory: { bg: "#8b4513", fg: "#ffffff" },
  git: { bg: "#404040", fg: "#ffffff" },
  model: { bg: "#2d2d2d", fg: "#ffffff" },
  session: { bg: "#202020", fg: "#00ffff" },
  block: { bg: "#2a2a2a", fg: "#87ceeb" },
  today: { bg: "#1a1a1a", fg: "#98fb98" },
  tmux: { bg: "#2f4f2f", fg: "#90ee90" },
  context: { bg: "#4a5568", fg: "#cbd5e0" },
  contextWarning: { bg: "#92400e", fg: "#fbbf24" },
  contextCritical: { bg: "#991b1b", fg: "#fca5a5" },
  metrics: { bg: "#374151", fg: "#d1d5db" },
  version: { bg: "#3a3a4a", fg: "#b8b8d0" },
};

export const darkAnsi256Theme: ColorTheme = {
  directory: { bg: "#af5f00", fg: "#ffffff" },
  git: { bg: "#444444", fg: "#ffffff" },
  model: { bg: "#3a3a3a", fg: "#ffffff" },
  session: { bg: "#262626", fg: "#00ffff" },
  block: { bg: "#303030", fg: "#87ceeb" },
  today: { bg: "#1c1c1c", fg: "#87ff87" },
  tmux: { bg: "#444444", fg: "#87ff87" },
  context: { bg: "#585858", fg: "#d0d0d0" },
  contextWarning: { bg: "#af5f00", fg: "#ffaf00" },
  contextCritical: { bg: "#870000", fg: "#ff8787" },
  metrics: { bg: "#4e4e4e", fg: "#d0d0d0" },
  version: { bg: "#444444", fg: "#d7afff" },
};

export const darkAnsiTheme: ColorTheme = {
  directory: { bg: "#d75f00", fg: "#ffffff" },
  git: { bg: "#585858", fg: "#ffffff" },
  model: { bg: "#444444", fg: "#ffffff" },
  session: { bg: "#303030", fg: "#00ffff" },
  block: { bg: "#3a3a3a", fg: "#5fafff" },
  today: { bg: "#262626", fg: "#00ff00" },
  tmux: { bg: "#585858", fg: "#00ff00" },
  context: { bg: "#808080", fg: "#ffffff" },
  contextWarning: { bg: "#d75f00", fg: "#ffff00" },
  contextCritical: { bg: "#af0000", fg: "#ff0000" },
  metrics: { bg: "#666666", fg: "#ffffff" },
  version: { bg: "#585858", fg: "#af87ff" },
};
