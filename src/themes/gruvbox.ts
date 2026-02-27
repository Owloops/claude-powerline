import type { ColorTheme } from "./index";

export const gruvboxTheme: ColorTheme = {
  directory: { bg: "#504945", fg: "#ebdbb2" },
  git: { bg: "#3c3836", fg: "#b8bb26" },
  model: { bg: "#665c54", fg: "#83a598" },
  session: { bg: "#282828", fg: "#8ec07c" },
  block: { bg: "#3c3836", fg: "#83a598" },
  today: { bg: "#282828", fg: "#fabd2f" },
  tmux: { bg: "#282828", fg: "#fe8019" },
  context: { bg: "#458588", fg: "#ebdbb2" },
  contextWarning: { bg: "#d79921", fg: "#282828" },
  contextCritical: { bg: "#cc241d", fg: "#ebdbb2" },
  metrics: { bg: "#d3869b", fg: "#282828" },
  version: { bg: "#504945", fg: "#8ec07c" },
  env: { bg: "#3c3836", fg: "#d3869b" },
};

export const gruvboxAnsi256Theme: ColorTheme = {
  directory: { bg: "#585858", fg: "#ffffaf" },
  git: { bg: "#444444", fg: "#afaf00" },
  model: { bg: "#6c6c6c", fg: "#87afaf" },
  session: { bg: "#303030", fg: "#87af87" },
  block: { bg: "#444444", fg: "#87afaf" },
  today: { bg: "#303030", fg: "#ffaf00" },
  tmux: { bg: "#303030", fg: "#ff8700" },
  context: { bg: "#5f8787", fg: "#ffffaf" },
  contextWarning: { bg: "#d7af00", fg: "#303030" },
  contextCritical: { bg: "#d70000", fg: "#ffffaf" },
  metrics: { bg: "#d787af", fg: "#303030" },
  version: { bg: "#585858", fg: "#87af87" },
  env: { bg: "#444444", fg: "#d787af" },
};

export const gruvboxAnsiTheme: ColorTheme = {
  directory: { bg: "#808080", fg: "#ffff00" },
  git: { bg: "#585858", fg: "#00ff00" },
  model: { bg: "#808080", fg: "#00afff" },
  session: { bg: "#444444", fg: "#00d787" },
  block: { bg: "#585858", fg: "#00afff" },
  today: { bg: "#444444", fg: "#ffaf00" },
  tmux: { bg: "#444444", fg: "#ff8700" },
  context: { bg: "#008787", fg: "#ffffff" },
  contextWarning: { bg: "#d7af00", fg: "#000000" },
  contextCritical: { bg: "#d70000", fg: "#ffffff" },
  metrics: { bg: "#ff87af", fg: "#444444" },
  version: { bg: "#808080", fg: "#00d787" },
  env: { bg: "#585858", fg: "#ff87af" },
};
