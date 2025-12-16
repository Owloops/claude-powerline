import type { ColorTheme } from "./index";

export const darkTheme: ColorTheme = {
  directory: { bg: "#8b4513", fg: "#ffffff" },
  git: { bg: "#404040", fg: "#ffffff" },
  model: { bg: "#2d2d2d", fg: "#ffffff" },
  session: { bg: "#202020", fg: "#00ffff" },
  block: { bg: "#2a2a2a", fg: "#87ceeb" },
  today: { bg: "#1a1a1a", fg: "#98fb98" },
  weekly: { bg: "#1a1a2a", fg: "#dda0dd" },
  tmux: { bg: "#2f4f2f", fg: "#90ee90" },
  context: { bg: "#4a5568", fg: "#cbd5e0" },
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
  weekly: { bg: "#262626", fg: "#d7afff" },
  tmux: { bg: "#444444", fg: "#87ff87" },
  context: { bg: "#585858", fg: "#d0d0d0" },
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
  weekly: { bg: "#303030", fg: "#af87ff" },
  tmux: { bg: "#585858", fg: "#00ff00" },
  context: { bg: "#808080", fg: "#ffffff" },
  metrics: { bg: "#666666", fg: "#ffffff" },
  version: { bg: "#585858", fg: "#af87ff" },
};
