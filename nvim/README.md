# cpline

Neovim-native TUI frontend for Claude Code.

## Features

| Feature | Description |
|---------|-------------|
| Multi-session tabs | Buffer-swapping sessions with gt/gT, each with own cost/token tracking |
| Session history | Browse and resume past sessions via mini.pick picker |
| Plan/exec modes | Readonly planning mode with system prompt constraints, exec for full access |
| File edit previews | Floating diff overlay for Edit, syntax-highlighted preview for Write |
| Animated spinners | Braille-pattern spinners for thinking, streaming, and tool execution states |
| Context tracking | Real-time context window percentage, token counts, cache hit stats |
| Tool display | Per-tool-type formatting with box-drawn headers and right-aligned file paths |
| Slash commands | /cost, /clear, /plan, /exec, /sessions, /new |
| Markdown rendering | Treesitter highlighting + render-markdown.nvim for headings and code blocks |
| Status panel | Session cost, context bar, metrics (response time, lines +/-), git info |

## Requirements

- Neovim 0.12+
- Claude Code CLI (`claude`) in PATH

## Quick Start

```bash
./nvim/bin/cpline
```

The launcher creates an isolated Neovim instance (`NVIM_APPNAME=cpline`) with its own config at `~/.config/cpline`.

## Keybindings

The input box works like a normal text field. No vim mode switching needed.

**Input (always insert mode):**

| Key | Action |
|-----|--------|
| `Enter` | Send prompt |
| `Shift+Enter` | Insert newline (multi-line prompts) |
| `Esc` | Switch to conversation (for reading) |

**Conversation (read-only):**

| Key | Action |
|-----|--------|
| Arrow keys, `j`/`k`, `gg`/`G` | Scroll |
| `/` | Search |
| `Tab` or `i` | Back to input |
| `gt` / `gT` | Next/previous session |
| `q` | Quit |

**Global (work from any panel):**

| Key | Action |
|-----|--------|
| `Ctrl-p` | Toggle plan/exec mode |
| `Ctrl-n` | New session tab |
| `Ctrl-h` | Session history picker |
| `Ctrl-c` | Cancel request |
| `Ctrl-q` | Quit |

## Slash Commands

| Command | Action |
|---------|--------|
| `/cost` | Show session cost breakdown |
| `/clear` | Clear conversation buffer |
| `/plan` | Switch to plan mode |
| `/exec` | Switch to exec mode |
| `/model <name>` | Switch model (sonnet, opus, haiku, or full ID) |
| `/compact` | Summarize conversation to reduce context |
| `/file <path>` | Attach file to next prompt |
| `/sessions` | Open session history picker |
| `/new` | New session tab |

File attachments queue until the next prompt. Multiple `/file` calls stack. The content is prepended to your message when you press Enter.

## Project Instructions

cpline reads `AGENTS.md` or `.agents.md` from the working directory and appends it as a system prompt. This is in addition to `CLAUDE.md` which `claude -p` reads natively.

## Layout

```
+------------------+----------+
|  [tabs]          | [model]  |
|  conversation    |  status  |
|  (resizable)     | (resize) |
+------------------+----------+
|  [mode]                     |
|  input                      |
+-----------------------------+
 keybind hints
```

Panels use native Neovim splits with mouse-draggable separators. The status panel width and input height are adjustable.

## Architecture

```
cpline/
  init.lua        Main module, keymaps, commands, slash commands
  layout.lua      Split-based window management, status panel rendering
  backend.lua     claude -p spawning, stream-json parsing
  session.lua     Multi-session state (create, switch, close)
  preview.lua     File edit/write preview overlays
  history.lua     Session history picker via mini.pick
  anim.lua        Braille spinner animations via extmarks
  highlight.lua   Luminous Mote color palette and highlight groups
  deps.lua        Plugin dependencies (treesitter, render-markdown, mini.nvim)
```

Backend spawns `claude -p --output-format stream-json --dangerously-skip-permissions` with `--resume` for session continuity. Plan mode appends a readonly system prompt via `--append-system-prompt`.

Each session owns its own conversation buffer, backend process state, and metrics. Switching sessions swaps which buffer the conversation window displays.

## Design System

Luminous Mote palette (BrowserBird variant), matching the claude-powerline statusline:

- Backgrounds: `#0a0e14` deep, `#111827` surface, `#1a2332` elevated
- Accent: `#5b8cf0` blue, `#7ba6ff` glow
- Text: `#d4dae3` primary, `#8891a0` secondary, `#5c6573` muted
- Semantic: `#3ec97a` green, `#e8a83e` amber, `#e05c5c` red
- Icons from claude-powerline: `§` cost, `◆` messages, `◔` context, `◱` block, `✱` model, `⎇` git

## Dependencies

| Plugin | Purpose |
|--------|---------|
| nvim-treesitter | Syntax highlighting in code blocks |
| render-markdown.nvim | Heading rendering, code block backgrounds |
| mini.notify | Completion notifications |
| mini.pick | Session history picker |
| mini.icons | File type icons |
| mini.cursorword | Word highlighting |

## Development

```bash
# Launch
./nvim/bin/cpline

# Lint
cd nvim && luacheck lua/ plugin/
```

## License

Part of [claude-powerline](https://github.com/Owloops/claude-powerline). See root LICENSE.
