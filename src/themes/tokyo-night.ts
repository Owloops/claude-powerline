import type { ColorTheme } from "./index";

export const tokyoNightTheme: ColorTheme = {
  directory: { bg: "#2f334d", fg: "#82aaff" },
  git: { bg: "#1e2030", fg: "#c3e88d" },
  model: { bg: "#191b29", fg: "#fca7ea" },
  session: { bg: "#222436", fg: "#86e1fc" },
  block: { bg: "#2d3748", fg: "#7aa2f7" },
  today: { bg: "#1a202c", fg: "#4fd6be" },
  tmux: { bg: "#191b29", fg: "#4fd6be" },
  context: { bg: "#414868", fg: "#c0caf5" },
  contextWarning: { bg: "#ff9e64", fg: "#1a1b26" },
  contextCritical: { bg: "#f7768e", fg: "#1a1b26" },
  metrics: { bg: "#3d59a1", fg: "#c0caf5" },
  version: { bg: "#292e42", fg: "#bb9af7" },
};

export const tokyoNightAnsi256Theme: ColorTheme = {
  directory: { bg: "#444478", fg: "#87afff" },
  git: { bg: "#262640", fg: "#afff87" },
  model: { bg: "#1c1c30", fg: "#ff87ff" },
  session: { bg: "#3a3a50", fg: "#5fd7ff" },
  block: { bg: "#4e4e68", fg: "#5f87ff" },
  today: { bg: "#262640", fg: "#00d7af" },
  tmux: { bg: "#1c1c30", fg: "#00d7af" },
  context: { bg: "#5f5f87", fg: "#d7d7ff" },
  contextWarning: { bg: "#ffaf5f", fg: "#262626" },
  contextCritical: { bg: "#ff5f87", fg: "#262626" },
  metrics: { bg: "#5f5faf", fg: "#d7d7ff" },
  version: { bg: "#444460", fg: "#d787ff" },
};

export const tokyoNightAnsiTheme: ColorTheme = {
  directory: { bg: "#5f5faf", fg: "#87afff" },
  git: { bg: "#303050", fg: "#87ff87" },
  model: { bg: "#262640", fg: "#ff87ff" },
  session: { bg: "#444470", fg: "#00d7ff" },
  block: { bg: "#666680", fg: "#5f87ff" },
  today: { bg: "#303050", fg: "#00d787" },
  tmux: { bg: "#262640", fg: "#00d787" },
  context: { bg: "#808080", fg: "#ffffff" },
  contextWarning: { bg: "#ffaf00", fg: "#000000" },
  contextCritical: { bg: "#ff5f5f", fg: "#000000" },
  metrics: { bg: "#8787d7", fg: "#ffffff" },
  version: { bg: "#585870", fg: "#d787ff" },
};
