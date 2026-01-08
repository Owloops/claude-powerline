import type { ColorTheme } from "./index";

export const nordTheme: ColorTheme = {
  directory: { bg: "#434c5e", fg: "#d8dee9" },
  git: { bg: "#3b4252", fg: "#a3be8c" },
  model: { bg: "#4c566a", fg: "#81a1c1" },
  session: { bg: "#2e3440", fg: "#88c0d0" },
  block: { bg: "#3b4252", fg: "#81a1c1" },
  today: { bg: "#2e3440", fg: "#8fbcbb" },
  tmux: { bg: "#2e3440", fg: "#8fbcbb" },
  context: { bg: "#5e81ac", fg: "#eceff4" },
  contextWarning: { bg: "#d08770", fg: "#2e3440" },
  contextCritical: { bg: "#bf616a", fg: "#eceff4" },
  metrics: { bg: "#b48ead", fg: "#2e3440" },
  version: { bg: "#434c5e", fg: "#88c0d0" },
};

export const nordAnsi256Theme: ColorTheme = {
  directory: { bg: "#5f87af", fg: "#e4e4e4" },
  git: { bg: "#4e4e4e", fg: "#87d787" },
  model: { bg: "#6c6c6c", fg: "#87afd7" },
  session: { bg: "#3a3a3a", fg: "#5fafaf" },
  block: { bg: "#4e4e4e", fg: "#87afd7" },
  today: { bg: "#3a3a3a", fg: "#5fd7d7" },
  tmux: { bg: "#3a3a3a", fg: "#5fd7d7" },
  context: { bg: "#5f87d7", fg: "#ffffff" },
  contextWarning: { bg: "#d7875f", fg: "#3a3a3a" },
  contextCritical: { bg: "#d75f5f", fg: "#ffffff" },
  metrics: { bg: "#d787af", fg: "#3a3a3a" },
  version: { bg: "#5f87af", fg: "#5fafaf" },
};

export const nordAnsiTheme: ColorTheme = {
  directory: { bg: "#0087af", fg: "#ffffff" },
  git: { bg: "#585858", fg: "#87d700" },
  model: { bg: "#808080", fg: "#87afff" },
  session: { bg: "#444444", fg: "#00d7d7" },
  block: { bg: "#585858", fg: "#87afff" },
  today: { bg: "#444444", fg: "#00ffff" },
  tmux: { bg: "#444444", fg: "#00ffff" },
  context: { bg: "#0087ff", fg: "#ffffff" },
  contextWarning: { bg: "#d78700", fg: "#000000" },
  contextCritical: { bg: "#d75f5f", fg: "#ffffff" },
  metrics: { bg: "#ff87d7", fg: "#444444" },
  version: { bg: "#0087af", fg: "#00d7d7" },
};
