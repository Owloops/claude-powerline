# cpline: Neovim TUI Experiment - Findings

## What we built

A standalone Neovim-based TUI frontend for Claude Code (2,314 lines of Lua).
Used `NVIM_APPNAME` for isolation, `claude -p --output-format stream-json` for the backend.

Architecture: 9 Lua modules (init, layout, backend, session, preview, anim, highlight, history, deps)
leveraging mini.nvim (tabline, pick, clue, notify, icons, cursorword) and render-markdown.nvim.

## Key findings

### Neovim as TUI runtime

Neovim provides text rendering, treesitter syntax highlighting, window management, mouse support,
terminal protocol handling, and async I/O (vim.uv) for free. mini.nvim acts as a UI component
library (tabs, pickers, notifications, keybinding hints). This enabled building a functional
Claude chat TUI in ~2,300 lines vs opencode (500K+ Go) and Claude Code (1M+ TypeScript).

The approach works well for text-heavy, keyboard-driven apps targeting developers.
Not suitable for custom widgets, non-technical users, or apps needing rich media.

### Keybinding conventions across AI TUI tools

Comparison of opencode, Claude Code, and cpline keybindings:

- Tab for mode/agent cycling (opencode tab, claude-code shift+tab)
- ctrl+p for command palette (opencode ctrl+p, VS Code convention)
- ctrl+t for effort/variant cycling (opencode ctrl+t)
- ctrl+c for cancel (universal)
- g prefix for session navigation (gt/gT, vim tab convention)

mini.clue handles keybinding discoverability via which-key popup.
Buffer-local keymaps on nofile buffers require MiniClue.ensure_buf_triggers().

### mini.tabline for session tabs

Making conv buffers listed (buflisted=true) with nvim_buf_set_name lets mini.tabline
render them as standard tabs with mouse click support. Required:

- winfixbuf on input/status windows to prevent tab clicks changing wrong buffer
- Override MiniTablineSwitchBuffer to target conv_win via win_execute
- BufEnter autocmd to sync cpline session state when switching tabs

### Plugin vs standalone app

The standalone approach (NVIM_APPNAME) duplicates the user's entire setup: theme, keybindings,
mini.nvim config, treesitter. As a plugin, cpline would inherit everything, reducing code and
friction. One `vim.pack.add` call vs a separate installation.

### claudecode.nvim comparison

claudecode.nvim (10,655 lines) takes a fundamentally different approach:
- Runs Claude Code CLI in a terminal split
- Connects via WebSocket/MCP (reverse-engineered official protocol)
- Gives Claude real-time editor context: open files, selections, diagnostics
- Native Neovim diffs for proposed changes

cpline replaces the chat UI but has no editor context integration.
claudecode.nvim keeps Claude Code's terminal UI but adds full editor awareness.

The editor context problem (selections, diagnostics, file tracking) is the hard problem.
claudecode.nvim solves it. cpline's custom chat UI is nice-to-have but not essential.

### Decision

Shelving the standalone TUI approach. The custom chat UI (status panel, cost tracking,
multi-session tabs, plan/exec mode) doesn't differentiate enough against:
1. Claude Code's own improving TUI
2. claudecode.nvim's full editor integration

If revisited, the most viable path would be a plugin that provides cpline's chat UI
as a frontend while using claudecode.nvim's MCP server for editor context.

## LOC comparison

| Project | Lines |
|---------|------:|
| cpline | 2,314 |
| claudecode.nvim | 10,655 |
| opencode | ~500,000 |
| Claude Code | ~1,000,000 |

## Files in this experiment

All under nvim/ directory on feat/neovim-tui-mvp branch (removed).
