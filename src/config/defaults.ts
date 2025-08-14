import type { PowerlineConfig } from "./loader";

export const DEFAULT_CONFIG: PowerlineConfig = {
  theme: "dark",
  display: {
    style: "minimal",
    lines: [
      {
        segments: {
          directory: { 
            enabled: true,
            showBasename: false
          },
          git: {
            enabled: true,
            showSha: false,
            showWorkingTree: false,
            showOperation: false,
            showTag: false,
            showTimeSinceCommit: false,
            showStashCount: false,
            showUpstream: false,
            showRepoName: false,
          },
          model: { enabled: true },
          session: { enabled: true, type: "tokens" },
          today: { enabled: false, type: "cost" },
          block: { enabled: true, type: "cost" },
          tmux: { enabled: false },
          context: { enabled: true },
          metrics: { 
            enabled: false,
            showResponseTime: true,
            showLastResponseTime: false,
            showDuration: true,
            showMessageCount: true,
            showCostBurnRate: false,
            showTokenBurnRate: false,
          },
        },
      },
    ],
  },
  budget: {
    session: {
      warningThreshold: 80,
    },
    today: {
      warningThreshold: 80,
      amount: 50,
    },
  },
};
