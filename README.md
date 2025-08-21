<div align="center">

# Claude Powerline

**A vim-style powerline statusline for Claude Code with real-time usage tracking, git integration, and custom themes.**

![License:MIT](https://img.shields.io/static/v1?label=License&message=MIT&color=blue&style=flat-square)
[![npm downloads](https://img.shields.io/npm/dm/@owloops/claude-powerline.svg)](https://www.npmjs.com/package/@owloops/claude-powerline)
[![npm version](https://img.shields.io/npm/v/@owloops/claude-powerline?style=flat-square)](https://www.npmjs.com/package/@owloops/claude-powerline)
[![Install size](https://packagephobia.com/badge?p=@owloops/claude-powerline)](https://packagephobia.com/result?p=@owloops/claude-powerline)
[![Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen)](https://www.npmjs.com/package/@owloops/claude-powerline)

[![Mentioned in Awesome Claude Code](https://awesome.re/mentioned-badge-flat.svg)](https://github.com/hesreallyhim/awesome-claude-code)

<table>
   <tr>
      <td align="center">
         <img src="images/claude-powerline-dark.png" width="500" alt="Dark Theme"><br>
         <strong>Dark</strong>
      </td>
      <td align="center">
         <img src="images/claude-powerline-light.png" width="500" alt="Light Theme"><br>
         <strong>Light</strong>
      </td>
   </tr>
   <tr>
      <td align="center">
         <img src="images/claude-powerline-nord.png" width="500" alt="Nord Theme"><br>
         <strong>Nord</strong>
      </td>
      <td align="center">
         <img src="images/claude-powerline-tokyo-night.png" width="500" alt="Tokyo Night Theme"><br>
         <strong>Tokyo Night</strong>
      </td>
   </tr>
   <tr>
      <td align="center">
         <img src="images/claude-powerline-rose-pine.png" width="500" alt="Rose Pine Theme"><br>
         <strong>Rose Pine</strong>
      </td>
      <td align="center">
         <img src="images/claude-powerline-custom.png" width="500" alt="Custom Theme"><br>
         <em>Create your own!</em>
      </td>
   </tr>
</table>
</div>

## Features

<table>
<tr>
<td width="50%">

### Usage Tracking

- Real-time session costs
- 5-hour billing window monitoring
- Daily budget alerts with percentages
- Token breakdown (input/output/cached)

### Git Integration

- Branch status with clean/dirty indicators
- Commits ahead/behind remote tracking
- Repository info (SHA, tags, stash count)
- Working tree staged/unstaged/untracked counts

</td>
<td width="50%">

### Customization

- 5 built-in themes (dark, light, nord, tokyo-night, rose-pine)
- Custom color configuration
- Powerline and minimal separator styles
- Multi-line layouts to prevent cutoff

### Performance Metrics

- Average and last response times
- Session duration tracking
- Message count monitoring
- Context usage with auto-compact threshold

</td>
</tr>
</table>

## Installation

### Setup

Requires Node.js 18+, Claude Code, and Git 2.0+.

**1. Install powerline fonts:**

```bash
npx -y @owloops/claude-powerline --install-fonts
```

**2. Add to your Claude Code `settings.json`:**

```json
{
  "statusLine": {
    "type": "command", 
    "command": "npx -y @owloops/claude-powerline@latest --style=powerline"
  }
}
```

**3. Start a Claude session** - the statusline appears at the bottom during conversations.

![Claude Code with powerline](images/claude-interface-with-powerline.png)

Using `npx` automatically downloads and runs the latest version without manual updates.

> [!NOTE]  
> If you encounter font issues, use `--style=minimal` (default) which works without powerline fonts.

## Usage

Once added to Claude Code settings, the statusline runs automatically. For customization:

**CLI Options:**

- `--theme` - `dark` (default), `light`, `nord`, `tokyo-night`, `rose-pine`, `custom`
- `--style` - `minimal` (default), `powerline`
- `--config` - Custom config file path
- `--install-fonts` - Install powerline fonts
- `--help` - Show help

**Examples:**

```bash
claude-powerline --theme=nord --style=powerline
claude-powerline --config=/path/to/config.json
```

**Environment Variables:**

```bash
export CLAUDE_POWERLINE_THEME=dark
export CLAUDE_POWERLINE_STYLE=powerline
export CLAUDE_POWERLINE_CONFIG=/path/to/config.json
export CLAUDE_POWERLINE_DEBUG=1  # Enable debug logging
```

## Configuration

**Get example config:**

```bash
# Download full-featured example config
curl -o ~/.claude/claude-powerline.json https://raw.githubusercontent.com/Owloops/claude-powerline/main/.claude-powerline.json
```

**Config locations** (first found wins):

- `./.claude-powerline.json` - Project-specific
- `~/.claude/claude-powerline.json` - User config  
- `~/.config/claude-powerline/config.json` - XDG standard

**Override priority:** CLI flags → Environment variables → Config files → Defaults

Config files reload automatically and no restart needed.

### Available Segments

| Segment | Description | Key Options |
|---------|-------------|-------------|
| `directory` | Current working directory | `showBasename` |
| `git` | Branch, status, repository info | `showSha`, `showWorkingTree`, `showTag`, `showStashCount`, `showOperation`, `showTimeSinceCommit`, `showUpstream`, `showRepoName` |
| `model` | Current Claude model | - |
| `session` | Real-time usage for conversation | `type`: `cost`\|`tokens`\|`both`\|`breakdown` |
| `block` | 5-hour billing window usage | `type`, `burnType`: `cost`\|`tokens`\|`both`\|`none` |
| `today` | Daily usage with budget monitoring | `type` |
| `context` | Context window usage | - |
| `tmux` | Tmux session info | - |
| `metrics` | Performance analytics | `showResponseTime`, `showLastResponseTime`, `showDuration`, `showMessageCount` |
| `version` | Claude Code version | - |

### Segment Configuration

#### Directory

Shows current working directory name.

```json
"directory": {
  "enabled": true,
  "showBasename": false
}
```

**Options:**

- `showBasename`: Show only folder name instead of full path

---

#### Git

Shows branch, status, and repository information.

```json
"git": {
  "enabled": true,
  "showSha": true,
  "showWorkingTree": false,
  "showOperation": false,
  "showTag": false,
  "showTimeSinceCommit": false,
  "showStashCount": false,
  "showUpstream": false,
  "showRepoName": false
}
```

**Options:**

- `showSha`: Show abbreviated commit SHA
- `showWorkingTree`: Show staged/unstaged/untracked counts
- `showOperation`: Show ongoing operations (MERGE/REBASE/CHERRY-PICK)
- `showTag`: Show nearest tag
- `showTimeSinceCommit`: Show time since last commit
- `showStashCount`: Show stash count
- `showUpstream`: Show upstream branch
- `showRepoName`: Show repository name

**Symbols:**

- `⎇` Branch • `♯` SHA • `⌂` Tag • `⧇` Stash • `✓` Clean • `●` Dirty • `⚠` Conflicts • `↑3` Ahead • `↓2` Behind • `(+1 ~2 ?3)` Staged/Unstaged/Untracked

---

#### Metrics

Shows performance analytics from your Claude sessions.

```json
"metrics": {
  "enabled": true,
  "showResponseTime": true,
  "showLastResponseTime": false,
  "showDuration": true,
  "showMessageCount": true
}
```

**Options:**

- `showResponseTime`: Average response time across all messages
- `showLastResponseTime`: Time for the last response (shows `0.0s` while waiting)
- `showDuration`: Total time since session started
- `showMessageCount`: Number of user messages sent

**Symbols:**

- `⧖` Average response time • `Δ` Last response time • `⧗` Session duration • `⟐` Message count

---

#### Model

Shows current Claude model being used.

```json
"model": {
  "enabled": true
}
```

---

#### Context

Shows context window usage and auto-compact threshold.

```json
"context": {
  "enabled": true
}
```

**Display:** `◔ 34,040 (79%)` - tokens used and percentage remaining until auto-compact

---

#### Tmux

Shows tmux session name and window info when in tmux.

```json
"tmux": {
  "enabled": true
}
```

---

#### Version

Shows Claude Code version.

```json
"version": {
  "enabled": true
}
```

**Display:** `v1.0.81`

---

#### Session

Shows real-time usage for current Claude conversation.

```json
"session": {
  "enabled": true,
  "type": "tokens"
}
```

**Options:**

- `type`: Display format - `cost` | `tokens` | `both` | `breakdown`

**Symbols:** `§` Session

---

#### Block

Shows usage within current 5-hour billing window (Claude's rate limit period).

```json
"block": {
  "enabled": true,
  "type": "cost",
  "burnType": "cost"
}
```

**Options:**

- `type`: Display format - `cost` | `tokens` | `both` | `time`
- `burnType`: Burn rate display - `cost` | `tokens` | `both` | `none`

**Symbols:** `◱` Block

---

#### Today

Shows total daily usage with budget monitoring.

```json
"today": {
  "enabled": true,
  "type": "cost"
}
```

**Options:**

- `type`: Display format - `cost` | `tokens` | `both` | `breakdown`

**Symbols:** `☉` Today

### Budget Configuration

```json
"budget": {
  "session": { "amount": 10.0, "warningThreshold": 80 },
  "today": { "amount": 25.0, "warningThreshold": 80 }
}
```

**Indicators:** `25%` Normal • `+75%` Moderate (50-79%) • `!85%` Warning (80%+)

### Multi-line Layout

Prevent segment cutoff by organizing segments across multiple lines.

```json
{
  "display": {
    "lines": [
      {
        "segments": {
          "directory": { "enabled": true },
          "git": { "enabled": true },
          "model": { "enabled": true }
        }
      },
      {
        "segments": {
          "session": { "enabled": true },
          "today": { "enabled": true },
          "context": { "enabled": true }
        }
      }
    ]
  }
}
```

> [!NOTE]  
> Claude Code system messages may truncate long status lines. Multi-line layouts prevent segment cutoff and improve readability.

### Custom Colors

Create custom themes by defining segment colors.

```json
{
  "theme": "custom",
  "colors": {
    "custom": {
      "directory": { "bg": "#ff6600", "fg": "#ffffff" },
      "git": { "bg": "#0066cc", "fg": "#ffffff" },
      "session": { "bg": "#cc0099", "fg": "#ffffff" }
    }
  }
}
```

**Color Options:**

- `bg`: Background color (hex, `transparent`, or `none`)
- `fg`: Foreground/text color (hex)

> [!TIP]  
> Copy existing theme colors from `src/themes/` in the repository as a starting point.

## Custom Segments

Extend the statusline using shell composition for unlimited flexibility.

### Simple Addition

Add custom segments using shell commands:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y @owloops/claude-powerline && echo \" $(date +%H:%M)\"",
    "padding": 0
  }
}
```

### With Colors

Use `tput` for terminal-compatible colors:

```bash
echo "$(tput setab 4)$(tput setaf 15) ⏱ $(date +%H:%M) $(tput sgr0)"
# setab: background (1-7) | setaf: foreground (0-15) | sgr0: reset
```

### Advanced Script

Create `~/.local/bin/my-statusline` for complex extensions:

```bash
#!/bin/bash
npx -y @owloops/claude-powerline
echo "$(tput setab 6)$(tput setaf 0) ⏱ $(date +%H:%M) $(tput sgr0)"
```

> [!TIP]  
> Shell composition provides unlimited flexibility while keeping the core package secure.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for people who have contributed outside of GitHub PRs.

### Library Usage

Claude-powerline is designed as a CLI tool for Claude Code statuslines. While the codebase contains reusable components like `PricingService` and `PowerlineRenderer`, we currently focus on the CLI use case to keep the project simple and maintainable.

## License

This project is licensed under the [MIT License](LICENSE).
