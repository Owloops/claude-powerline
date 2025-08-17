<div align="center">

# Claude Powerline

**A vim-style powerline statusline for Claude Code with real-time usage tracking, git integration, and custom themes.**

![Language:TypeScript](https://img.shields.io/static/v1?label=Language&message=TypeScript&color=blue&style=flat-square)
![License:MIT](https://img.shields.io/static/v1?label=License&message=MIT&color=blue&style=flat-square)
[![npm version](https://img.shields.io/npm/v/@owloops/claude-powerline?style=flat-square)](https://www.npmjs.com/package/@owloops/claude-powerline)
[![Mentioned in Awesome Claude Code](https://awesome.re/mentioned-badge-flat.svg)](https://github.com/hesreallyhim/awesome-claude-code)

<table>
   <tr>
      <td align="center">
         <img src="images/claude-powerline-dark.png" width="400" alt="Dark Theme"><br>
         <strong>Dark</strong>
      </td>
      <td align="center">
         <img src="images/claude-powerline-light.png" width="400" alt="Light Theme"><br>
         <strong>Light</strong>
      </td>
   </tr>
   <tr>
      <td align="center">
         <img src="images/claude-powerline-nord.png" width="400" alt="Nord Theme"><br>
         <strong>Nord</strong>
      </td>
      <td align="center">
         <img src="images/claude-powerline-tokyo-night.png" width="400" alt="Tokyo Night Theme"><br>
         <strong>Tokyo Night</strong>
      </td>
   </tr>
   <tr>
      <td align="center">
         <img src="images/claude-powerline-rose-pine.png" width="400" alt="Rose Pine Theme"><br>
         <strong>Rose Pine</strong>
      </td>
      <td align="center">
         <img src="images/claude-powerline-custom.png" width="400" alt="Custom Theme"><br>
         <em>Create your own!</em>
      </td>
   </tr>
</table>
</div>

## Features

<table>
<tr>
<td width="50%" valign="top">

### Core Features

- **Vim-style powerline** with proper arrows and segments
- **Real-time session tracking** with costs and tokens
- **Billing window tracking** with 5-hour blocks and burn rates
- **Daily usage monitoring** with budget alerts
- **Performance metrics** with response times
- **Context monitoring** showing tokens used and auto-compact threshold
- **Git integration** with branch, status, ahead/behind counts

</td>
<td width="50%" valign="top">

### Customization

- **Custom themes** with full color control
- **Budget monitoring** with percentage warnings
- **Flexible configuration** via JSON files and environment variables

</td>
</tr>
</table>

## Installation

### Requirements

- **Node.js 18+**
- **Claude Code**

### Setup

**Install powerline fonts:**

```bash
npx -y @owloops/claude-powerline --install-fonts
```

> [!WARNING]  
> Without powerline fonts, arrow separators display as placeholder characters (�). The default `--style=minimal` mode resolves it by not using the powerline unicode.

**Add to your Claude Code `settings.json`:**

```json
{
  "statusLine": {
    "type": "command", 
    "command": "npx -y @owloops/claude-powerline@latest --style=powerline",
    "padding": 0
  }
}
```

> [!NOTE]  
> Using `npx` automatically downloads and runs the latest version, ensuring you always have the newest features and fixes without manual updates.

**Start a Claude session:** It appears at the bottom during conversations.

![Claude Code with powerline](images/claude-interface-with-powerline.png)

> [!TIP]  
> The statusline shows your **current directory name** (not "claude powerline") and updates with live usage data during Claude conversations.

## Usage

```bash
claude-powerline [OPTIONS]
```

Options are specified by command line flags. Overall configuration can also use environment variables or configuration files.

## Command Line Options

| Option             | Values                                                                  | Description                       |
| ------------------ | ----------------------------------------------------------------------- | --------------------------------- |
| `--theme`          | `dark` (default), `light`, `nord`, `tokyo-night`, `rose-pine`, `custom` | Set color theme                   |
| `--style`          | `minimal` (default), `powerline`                                        | Set separator style               |
| `--usage`          | `cost`, `tokens`, `both`, `breakdown`                                   | Set usage display format          |
| `--session-budget` | `AMOUNT`                                                                | Set session budget limit in USD   |
| `--config`         | `PATH`                                                                  | Use custom config file path       |
| `--install-fonts`  | -                                                                       | Install powerline fonts to system |
| `-h, --help`       | -                                                                       | Show help message                 |

> [!NOTE]  
> Global options have CLI flags and environment variables. Individual segments are configured through config files.

### Usage Display Types

- **cost**: Show dollar amounts (`$0.05`)
- **tokens**: Show token counts (`1.2K tokens`)  
- **both**: Show both (`$0.05 (1.2K tokens)`)
- **breakdown**: Show detailed token breakdown (`1.2Kin + 0.8Kout + 1.5Kcached`)

## Examples

### Default Configuration

```bash
# Shows directory, git, model, session usage (tokens), block usage, context info
# Uses dark theme, minimal style
claude-powerline
```

### Theme and Style

```bash
# Nord theme with powerline arrows
claude-powerline --theme=nord --style=powerline

# Tokyo Night theme, minimal style
claude-powerline --theme=tokyo-night --style=minimal
```

### Usage Display

```bash
# Show token breakdown instead of costs
claude-powerline --usage=breakdown

# Set session budget limit
claude-powerline --session-budget=50
```

### Status Indicators

#### Symbols

- **Session**: `§` Section sign for session costs
- **Block**: `◱` Clock symbol for 5-hour blocks  
- **Today**: `☉` Sun symbol for daily usage
- **Git Branch**: `⎇` Branch symbol
- **Git Tag**: `⌂` House/tag symbol
- **Git SHA**: `♯` Hash symbol
- **Git Stash**: `⧇` Double square symbol
- **Metrics Delta**: `Δ` Delta for last response time

#### Status States

- **Git**: `✓` Clean, `●` Dirty, `⚠` Conflicts, `↑3` Ahead, `↓2` Behind remote
- **Context**: `◔ 34,040 (79%)` - Token count and percentage remaining until auto-compact
- **Budget**: `25%` Normal (under 50%), `+75%` Moderate (50-79%), `!85%` Warning (80%+)

## Configuration

Create config file:

```bash
# Copy example config from repository
curl -o ~/.claude/claude-powerline.json https://raw.githubusercontent.com/Owloops/claude-powerline/main/.claude-powerline.json
```

> [!IMPORTANT]  
> The example configuration showcases all available segments and features of the powerline.

![All Segments Demo](images/claude-powerline-all-segments.png)

Configuration priority (top overrides bottom):

1. CLI arguments (`--theme`, `--style`, `--usage`, `--session-budget`, `--config`)
2. Environment variables (`CLAUDE_POWERLINE_THEME`, `CLAUDE_POWERLINE_STYLE`, `CLAUDE_POWERLINE_USAGE_TYPE`, `CLAUDE_POWERLINE_SESSION_BUDGET`, `CLAUDE_POWERLINE_CONFIG`)
3. Config files (first found):
   - `./.claude-powerline.json` (project)
   - `~/.claude/claude-powerline.json` (user)  
   - `~/.config/claude-powerline/config.json` (XDG)
4. Default values

> [!NOTE]  
> Config files are reloaded automatically when changed - no need to restart Claude Code.

### Available Segments

```json
{
  "display": {
    "lines": [
      {
        "segments": {
          "directory": { 
            "enabled": true,
            "showBasename": false
          },
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
          },
          "model": { "enabled": true },
          "session": { "enabled": true, "type": "tokens" },
          "block": { "enabled": true, "type": "cost", "burnType": "cost" },
          "today": { "enabled": true, "type": "cost" },
          "context": { "enabled": true },
          "tmux": { "enabled": true },
          "metrics": { 
            "enabled": true,
            "showResponseTime": true,
            "showLastResponseTime": false,
            "showDuration": true,
            "showMessageCount": true
          },
          "version": { "enabled": true }
        }
      }
    ]
  }
}
```

### Segment Details

- **directory**: Current working directory name (supports `showBasename` option)
- **git**: Branch, status, and extensive repository information (see Git Configuration below)
- **model**: Current Claude model being used
- **session**: Token usage and costs for current session
- **block**: Usage within current 5-hour billing window
- **today**: Total daily usage with budget monitoring
- **context**: Context window usage and auto-compact threshold
- **tmux**: Tmux session name and window info (when in tmux)
- **metrics**: Performance analytics (see Metrics Configuration below)
- **version**: Claude Code version (e.g., v1.0.81)

#### Directory Configuration

```json
"directory": {
  "enabled": true,
  "showBasename": false  // Show only folder name instead of full path
}
```

#### Git Configuration

The git segment now supports extensive repository information:

```json
"git": {
  "enabled": true,
  "showSha": true,              // Show abbreviated commit SHA (♯ abc123)
  "showWorkingTree": false,     // Show staged/unstaged/untracked counts ((+1 ~2 ?3))
  "showOperation": false,        // Show ongoing operations (MERGE/REBASE/CHERRY-PICK)
  "showTag": false,              // Show nearest tag (⌂ v1.5.0)
  "showTimeSinceCommit": false, // Show time since last commit (⏰ 2h)
  "showStashCount": false,      // Show stash count (⧇ 3)
  "showUpstream": false,        // Show upstream branch (→ origin/main)
  "showRepoName": false         // Show repository name
}
```

**Git Status Indicators:**

- `✓` Clean working tree
- `●` Uncommitted changes
- `⚠` Merge conflicts
- `↑3` Commits ahead of upstream
- `↓2` Commits behind upstream
- `(+1 ~2 ?3)` Staged/Unstaged/Untracked file counts

#### Metrics Configuration

The metrics segment displays performance analytics from your Claude sessions:

```json
"metrics": {
  "enabled": true,
  "showResponseTime": true,      // Average response time (`⧖ 3.2s`)
  "showLastResponseTime": false, // Last response time (`Δ 2.8s`)
  "showDuration": true,          // Session duration (`⧗ 28m`)
  "showMessageCount": true       // User message count (`⟐ 93`)
}
```

**Metrics Display:**

- `showResponseTime`: Average response time across all messages
- `showLastResponseTime`: Time for the last response (shows `0.0s` while waiting)
- `showDuration`: Total time since session started
- `showMessageCount`: Number of user messages sent

![Metrics Segment Example](images/claude-powerline-metrics.png)

#### Usage Segments Configuration

The powerline includes three complementary usage segments:

```json
{
  "segments": {
    "session": { "enabled": true, "type": "tokens" },
    "block": { "enabled": true, "type": "cost" },
    "today": { "enabled": true, "type": "cost" }
  },
  "budget": {
    "session": { "amount": 10.0, "warningThreshold": 80 },
    "today": { "amount": 25.0, "warningThreshold": 80 }
  }
}
```

**Segment Types:**

- **session**: Real-time usage for current Claude conversation
- **block**: Usage within current 5-hour billing window (Claude's rate limit period)
- **today**: Total daily usage with budget monitoring

**Display Options:**

**Session & Today segments:**

- `cost`: Show dollar amounts (`$0.05`)
- `tokens`: Show token counts (`1.2K tokens`)
- `both`: Show both (`$0.05 (1.2K)`)
- `breakdown`: Show token breakdown (`1.2Kin + 0.8Kout + 1.5Kcached`)

**Block segment** (always shows time remaining):

- `cost`: Show cost + time (`$0.05 (2h 30m left)`)
- `tokens`: Show tokens + time (`1.2K tokens (2h 30m left)`)
- `both`: Show both cost and tokens + time
- `time`: Show only time remaining

**Block burn rates** (configured with `burnType`):

```json
"block": { "enabled": true, "type": "cost", "burnType": "cost" }
```

- `cost`: Show cost burn rate (`$0.05 | $1.20/h (2h 30m left)`)
- `tokens`: Show token burn rate (`1.2K | 450K/h (2h 30m left)`)  
- `both`: Show both burn rates
- `none`: Hide burn rates

**Budget Configuration:**

```json
"budget": {
  "session": {
    "amount": 10.0,
    "warningThreshold": 80
  },
  "today": {
    "amount": 25.0, 
    "warningThreshold": 80
  }
}
```

**Budget Indicators:**

- `25%` Normal (under 50%)
- `+75%` Moderate (50-79%)
- `!85%` Warning (80%+)

**Why Use Different Segments?**

- **session**: Track spending per conversation  
- **block**: Monitor rate limits with time remaining (Claude throttles after 5-hour usage peaks)
- **today**: Stay within daily budgets

### Multi-line Layout (Optional)

To prevent segment cutoff, configure multiple lines:

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
          "session": { "enabled": true, "type": "tokens" },
          "block": { "enabled": true, "type": "cost", "burnType": "cost" },
          "today": { "enabled": true, "type": "cost" },
          "context": { "enabled": true },
          "tmux": { "enabled": false },
          "metrics": { "enabled": true },
          "version": { "enabled": true }
        }
      }
    ]
  }
}
```

> [!NOTE]  
> Claude Code system messages (e.g., Context left until auto-compact) may truncate the status line mid-sequence. Multi-line layouts help prevent segment cutoff.

### Custom Colors

To customize colors, copy dark or light theme colors from `src/themes/` in the repository, then modify:

```json
{
  "theme": "custom",
  "colors": {
    "custom": {
      "directory": { "bg": "#ff6600", "fg": "#ffffff" },
      "git": { "bg": "#0066cc", "fg": "#ffffff" },
      "model": { "bg": "#9900cc", "fg": "#ffffff" },
      "session": { "bg": "#cc0099", "fg": "#ffffff" },
      "block": { "bg": "#404040", "fg": "#cccccc" },
      "today": { "bg": "#303030", "fg": "#dddddd" },
      "context": { "bg": "#4a5568", "fg": "#ffffff" },
      "tmux": { "bg": "#228b22", "fg": "#ffffff" },
      "metrics": { "bg": "#374151", "fg": "#ffffff" },
      "version": { "bg": "#2d3748", "fg": "#ffffff" }
    }
  }
}
```

> [!TIP]
> Use `"transparent"` or `"none"` for background colors to create a minimal look:
> ```json
> "directory": { "bg": "transparent", "fg": "#00ff00" }
> ```

## Custom Segments

Extend the statusline by wrapping the command with shell composition:

### Add Custom Segments

Use `tput` for colors that match your terminal theme:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y @owloops/claude-powerline && echo \"$(tput setab 4)$(tput setaf 15) ⏱ $(date +%H:%M) $(tput sgr0)\"",
    "padding": 0
  }
}
```

Common `tput` colors:

- `setab 1` (red bg) `setaf 15` (white fg)
- `setab 2` (green bg) `setaf 0` (black fg)
- `setab 4` (blue bg) `setaf 15` (white fg)
- `setab 6` (cyan bg) `setaf 0` (black fg)

### Custom Wrapper Script

Create `~/.local/bin/my-statusline`:

```bash
#!/bin/bash
# Option 1: Same line (continuous)
cat | npx -y @owloops/claude-powerline | tr -d '\n'
echo -n "$(tput setab 6)$(tput setaf 0) ⏱ $(date +%H:%M) $(tput sgr0)"
echo "$(tput setab 2)$(tput setaf 0) ☁ $(curl -s wttr.in?format=%t 2>/dev/null || echo '?') $(tput sgr0)"

# Option 2: Separate lines (multiline)
# cat | npx -y @owloops/claude-powerline
# echo "$(tput setab 6)$(tput setaf 0) ⏱ $(date +%H:%M) $(tput sgr0)"
# echo "$(tput setab 2)$(tput setaf 0) ☁ $(curl -s wttr.in?format=%t 2>/dev/null || echo '?') $(tput sgr0)"
```

Then use it in `settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/full/path/to/my-statusline",
    "padding": 0
  }
}
```

> [!TIP]  
> Shell composition provides unlimited flexibility while keeping the core package secure - no arbitrary command execution needed. Use full absolute paths or ensure scripts are in your PATH.

## Environment Variables

```bash
export CLAUDE_POWERLINE_THEME=dark
export CLAUDE_POWERLINE_STYLE=powerline
export CLAUDE_POWERLINE_USAGE_TYPE=tokens
export CLAUDE_POWERLINE_CONFIG=/path/to/config.json
export CLAUDE_POWERLINE_DEBUG=1  # Enable debug logging
```

## Related Projects

- [**tweakcc**](https://github.com/Piebald-AI/tweakcc) - Customize Claude Code themes, thinking verbs, and more.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for people who have contributed outside of GitHub PRs.

## License

This project is licensed under the [MIT License](LICENSE).
