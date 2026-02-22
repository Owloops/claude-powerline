import type { ColorTheme } from "./index";

export const rosePineTheme: ColorTheme = {
  directory: { bg: "#26233a", fg: "#c4a7e7" },
  git: { bg: "#1f1d2e", fg: "#9ccfd8" },
  model: { bg: "#191724", fg: "#ebbcba" },
  session: { bg: "#26233a", fg: "#f6c177" },
  block: { bg: "#2a273f", fg: "#eb6f92" },
  today: { bg: "#232136", fg: "#9ccfd8" },
  tmux: { bg: "#26233a", fg: "#908caa" },
  context: { bg: "#393552", fg: "#e0def4" },
  contextWarning: { bg: "#f6c177", fg: "#191724" },
  contextCritical: { bg: "#eb6f92", fg: "#191724" },
  metrics: { bg: "#524f67", fg: "#e0def4" },
  version: { bg: "#2a273f", fg: "#c4a7e7" },
  env: { bg: "#21202e", fg: "#eb6f92" },
};

export const rosePineAnsi256Theme: ColorTheme = {
  directory: { bg: "#444444", fg: "#d787d7" },
  git: { bg: "#262626", fg: "#87d7d7" },
  model: { bg: "#1c1c1c", fg: "#ffaf87" },
  session: { bg: "#444444", fg: "#d7af5f" },
  block: { bg: "#4e4e4e", fg: "#ff5f87" },
  today: { bg: "#3a3a3a", fg: "#87d7d7" },
  tmux: { bg: "#444444", fg: "#9e9e9e" },
  context: { bg: "#585858", fg: "#e4e4e4" },
  contextWarning: { bg: "#d7af5f", fg: "#1c1c1c" },
  contextCritical: { bg: "#ff5f87", fg: "#1c1c1c" },
  metrics: { bg: "#767676", fg: "#e4e4e4" },
  version: { bg: "#4e4e4e", fg: "#d787d7" },
  env: { bg: "#303030", fg: "#ff5f87" },
};

export const rosePineAnsiTheme: ColorTheme = {
  directory: { bg: "#585858", fg: "#ff87ff" },
  git: { bg: "#303030", fg: "#00d7d7" },
  model: { bg: "#262626", fg: "#ffaf87" },
  session: { bg: "#585858", fg: "#d7af00" },
  block: { bg: "#666666", fg: "#ff5f87" },
  today: { bg: "#444444", fg: "#00d7d7" },
  tmux: { bg: "#585858", fg: "#bcbcbc" },
  context: { bg: "#808080", fg: "#ffffff" },
  contextWarning: { bg: "#d7af00", fg: "#000000" },
  contextCritical: { bg: "#ff5f5f", fg: "#000000" },
  metrics: { bg: "#a8a8a8", fg: "#000000" },
  version: { bg: "#666666", fg: "#ff87ff" },
  env: { bg: "#444444", fg: "#ff5f87" },
};
