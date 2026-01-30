import type { PowerlineConfig } from "./loader";

export const DEFAULT_CONFIG: PowerlineConfig = {
  theme: "dark",
  display: {
    style: "minimal",
    charset: "unicode",
    colorCompatibility: "auto",
    autoWrap: true,
    padding: 1,
    lines: [
      {
        segments: {
          directory: {
            enabled: true,
            style: "basename",
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
          session: { enabled: true, type: "tokens", costSource: "calculated" },
          today: { enabled: true, type: "cost" },
          block: { enabled: false, type: "cost", burnType: "cost" },
          version: { enabled: false },
          tmux: { enabled: false },
          context: { enabled: true, showPercentageOnly: false, displayStyle: "text" },
          metrics: {
            enabled: false,
            showResponseTime: true,
            showLastResponseTime: true,
            showDuration: true,
            showMessageCount: true,
            showLinesAdded: true,
            showLinesRemoved: true,
          },
          omcMode: { enabled: false },
          omcRalph: { enabled: false, warnThreshold: 7 },
          omcAgents: { enabled: false },
          omcSkill: { enabled: false },
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
    block: {
      warningThreshold: 80,
      amount: 15,
    },
  },
  modelContextLimits: {
    default: 200000,
    sonnet: 200000,
    opus: 200000,
  },
};
