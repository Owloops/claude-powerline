# cpline - Claude Powerline TUI (MVP)

Full-screen Neovim-based terminal UI for Claude Code.

**Status: experimental MVP**

## Requirements

- Neovim 0.10+
- Claude Code CLI (`claude`) installed and in PATH

## Quick Start

```bash
# From the repo root
./nvim/bin/cpline

# Or with an initial prompt
./nvim/bin/cpline "explain this codebase"
```

## Neovim Plugin Setup

Add to your plugin manager (lazy.nvim example):

```lua
{
  "Owloops/claude-powerline",
  config = function()
    -- Add the nvim subdirectory to runtimepath
    vim.opt.runtimepath:append(vim.fn.stdpath("data") .. "/lazy/claude-powerline/nvim")
    require("cpline").setup()
  end,
}
```

Then run `:Cpline` to open.

## Keybindings

| Key | Mode | Action |
|-----|------|--------|
| `Ctrl-s` | insert/normal | Send prompt |
| `Ctrl-c` | insert/normal | Cancel request |
| `Ctrl-n` | normal | New session |
| `Tab` | normal | Cycle windows (input/conversation/status) |
| `q` | normal (conversation) | Close |

## Layout

```
+------------------+--------+
|                  |        |
|  Conversation    | Status |
|  (markdown)      | Panel  |
|                  |        |
+------------------+--------+
| Input (vim mode)          |
+---------------------------+
```

## Architecture

- Backend: `claude -p --output-format stream-json` with `--resume` for session continuity
- Streaming: line-buffered JSON events parsed and dispatched to UI callbacks
- Conversation: Neovim buffer with markdown filetype (syntax highlighting)
- Input: vim-mode editing with full keybinding support
