<div align="center">

# Claude Powerline

**A vim-style powerline statusline for Claude Code with real-time usage tracking, git integration, and custom themes.**

![License:MIT](https://img.shields.io/static/v1?label=License&message=MIT&color=blue&style=flat-square)
[![npm downloads](https://img.shields.io/npm/dm/@owloops/claude-powerline.svg)](https://www.npmjs.com/package/@owloops/claude-powerline)
[![npm version](https://img.shields.io/npm/v/@owloops/claude-powerline?style=flat-square)](https://www.npmjs.com/package/@owloops/claude-powerline)
[![Install size](https://packagephobia.com/badge?p=@owloops/claude-powerline)](https://packagephobia.com/result?p=@owloops/claude-powerline)
[![Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen)](https://www.npmjs.com/package/@owloops/claude-powerline)

[![Mentioned in Awesome Claude Code](https://awesome.re/mentioned-badge-flat.svg)](https://github.com/hesreallyhim/awesome-claude-code)

### Demo

<img src="images/demo.gif" alt="Claude Powerline Demo" width="600"/>

_Live demonstration: real-time usage tracking, git integration, and theme showcase_

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
- Three separator styles: minimal, powerline, and capsule
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

Requires Node.js 18+, Claude Code, Git 2.0+, and terminal with [Nerd Font](https://www.nerdfonts.com/) for proper icon display.

**1. Add to your Claude Code `settings.json`:**

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y @owloops/claude-powerline@latest --style=powerline"
  }
}
```

**2. Start a Claude session** - the statusline appears at the bottom during conversations.

![Claude Code with powerline](images/claude-interface-with-powerline.png)

Using `npx` automatically downloads and runs the latest version without manual updates.

## Usage

Once added to Claude Code settings, the statusline runs automatically. For customization:

**CLI Options:**

- `--theme` - `dark` (default), `light`, `nord`, `tokyo-night`, `rose-pine`, `custom`
- `--style` - `minimal` (default), `powerline`, `capsule`
- `--config` - Custom config file path
- `--help` - Show help

**Examples:**

```bash
claude-powerline --theme=nord --style=powerline
claude-powerline --theme=dark --style=capsule
claude-powerline --config=/path/to/config.json
```

**Environment Variables:**

```bash
export CLAUDE_POWERLINE_THEME=dark
export CLAUDE_POWERLINE_STYLE=powerline
export CLAUDE_POWERLINE_CONFIG=/path/to/config.json
export CLAUDE_POWERLINE_DEBUG=1  # Enable debug logging
```

## Styles

<img src="images/claude-powerline-styles.png" alt="Claude Powerline Styles" width="600">

## Configuration

**Get example config:**

```bash
# Download full-featured example config
curl -o ~/.claude/claude-powerline.json https://raw.githubusercontent.com/Owloops/claude-powerline/main/.claude-powerline.json
```

**Config locations** (in priority order):

- `./.claude-powerline.json` - Project-specific
- `~/.claude/claude-powerline.json` - User config
- `~/.config/claude-powerline/config.json` - XDG standard

**Override priority:** CLI flags → Environment variables → Config files → Defaults

Config files reload automatically and no restart needed.

### Segment Configuration

<details>
<summary><strong>Directory</strong> - Shows current working directory name</summary>

```json
"directory": {
  "enabled": true,
  "showBasename": false
}
```

**Options:**

- `showBasename`: Show only folder name instead of full path

</details>

<details>
<summary><strong>Git</strong> - Shows branch, status, and repository information</summary>

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

</details>

<details>
<summary><strong>Metrics</strong> - Shows performance analytics from your Claude sessions</summary>

```json
"metrics": {
  "enabled": true,
  "showResponseTime": true,
  "showLastResponseTime": false,
  "showDuration": true,
  "showMessageCount": true,
  "showLinesAdded": true,
  "showLinesRemoved": true
}
```

**Options:**

- `showResponseTime`: Total API duration across all requests
- `showLastResponseTime`: Individual response time for most recent query
- `showDuration`: Total session duration
- `showMessageCount`: Number of user messages sent
- `showLinesAdded`: Lines of code added during session
- `showLinesRemoved`: Lines of code removed during session

**Symbols:**

- `⧖` Total API time • `Δ` Last response • `⧗` Session duration • `⟐` Messages • `+` Lines added • `-` Lines removed

</details>

<details>
<summary><strong>Model</strong> - Shows current Claude model being used</summary>

```json
"model": {
  "enabled": true
}
```

</details>

<details>
<summary><strong>Context</strong> - Shows context window usage and auto-compact threshold</summary>

```json
"context": {
  "enabled": true,
  "showPercentageOnly": false
}
```

**Options:**

- `showPercentageOnly`: Show only percentage remaining (default: false)

**Display:** `◔ 34,040 (79%)` or `◔ 79%` (percentage only)

##### Model Context Limits

Configure context window limits for different model types. Defaults to 200K tokens for all models.

```json
"modelContextLimits": {
  "sonnet": 1000000,
  "opus": 200000
}
```

**Available Model Types:**

- `sonnet`: Claude Sonnet models (3.5, 4, etc.)
- `opus`: Claude Opus models
- `default`: Fallback for unrecognized models (200K)

**Note:** Sonnet 4's 1M context window is currently in beta for tier 4+ users. Set `"sonnet": 1000000` when you have access.

</details>

<details>
<summary><strong>Tmux</strong> - Shows tmux session name and window info when in tmux</summary>

```json
"tmux": {
  "enabled": true
}
```

**Display:** `tmux:session-name`

</details>

<details>
<summary><strong>Version</strong> - Shows Claude Code version</summary>

```json
"version": {
  "enabled": true
}
```

**Display:** `v1.0.81`

</details>

<details>
<summary><strong>Session</strong> - Shows real-time usage for current Claude conversation</summary>

```json
"session": {
  "enabled": true,
  "type": "tokens",
  "costSource": "calculated"
}
```

**Options:**

- `type`: Display format - `cost` | `tokens` | `both` | `breakdown`
- `costSource`: Cost calculation method - `calculated` (ccusage-style) | `official` (hook data)

**Symbols:** `§` Session

</details>

<details>
<summary><strong>Block</strong> - Shows usage within current 5-hour billing window (Claude's rate limit period)</summary>

```json
"block": {
  "enabled": true,
  "type": "weighted",
  "burnType": "cost"
}
```

**Options:**

- `type`: Display format - `cost` | `tokens` | `both` | `time` | `weighted`
- `burnType`: Burn rate display - `cost` | `tokens` | `both` | `none`

**Weighted Tokens:** Opus tokens count 5x toward rate limits compared to Sonnet/Haiku tokens

**Symbols:** `◱` Block

</details>

<details>
<summary><strong>Today</strong> - Shows total daily usage with budget monitoring</summary>

```json
"today": {
  "enabled": true,
  "type": "cost"
}
```

**Options:**

- `type`: Display format - `cost` | `tokens` | `both` | `breakdown`

**Symbols:** `☉` Today

</details>

### Budget Configuration

```json
"budget": {
  "session": { "amount": 10.0, "warningThreshold": 80 },
  "today": { "amount": 25.0, "warningThreshold": 80 },
  "block": { "amount": 15.0, "type": "cost", "warningThreshold": 80 }
}
```

**Options:**

- `amount`: Budget limit (required for percentage display)
- `type`: Budget type - `cost` (USD) | `tokens` (for token-based limits)
- `warningThreshold`: Warning threshold percentage (default: 80)

**Indicators:** `25%` Normal • `+75%` Moderate (50-79%) • `!85%` Warning (80%+)

> [!TIP]  
> Claude's rate limits consider multiple factors beyond tokens (message count, length, attachments, model). See [Anthropic's usage documentation](https://support.anthropic.com/en/articles/11014257-about-claude-s-max-plan-usage) for details.

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

### Colors & Themes

Create custom themes and configure color compatibility:

```json
{
  "theme": "custom",
  "display": {
    "colorCompatibility": "auto"
  },
  "colors": {
    "custom": {
      "directory": { "bg": "#ff6600", "fg": "#ffffff" },
      "git": { "bg": "#0066cc", "fg": "#ffffff" },
      "session": { "bg": "#cc0099", "fg": "#ffffff" }
    }
  }
}
```

**Color Options:** `bg` (hex, `transparent`, `none`) • `fg` (hex)

**Compatibility Modes:** `auto` (default), `ansi`, `ansi256`, `truecolor`. Respects `NO_COLOR`, `FORCE_COLOR`, and `COLORTERM` environment variables.

## Performance

Execution times for different configurations:

- **~80ms** default config (`directory`, `git`, `model`, `session`, `today`, `context`)
- **~240ms** full-featured (all segments enabled)

<details>
<summary><strong>Detailed Segment Timings</strong></summary>

| Segment     | Timing | Notes                                      |
| ----------- | ------ | ------------------------------------------ |
| `directory` | ~40ms  | No external commands                       |
| `model`     | ~40ms  | Uses hook data                             |
| `session`   | ~40ms  | Minimal transcript parsing                 |
| `context`   | ~40ms  | Hook data calculation                      |
| `metrics`   | ~40ms  | Transcript analysis                        |
| `git`       | ~60ms  | No caching for fresh data                  |
| `tmux`      | ~50ms  | Environment check + command                |
| `block`     | ~180ms | 5-hour window transcript load              |
| `today`     | ~250ms | Full daily transcript load (cached: ~50ms) |
| `version`   | ~40ms  | Uses hook data                             |

**Benchmark:** `npm run benchmark:timing`

</details>

### Optimization Tips

- **Global install:** `npm install -g` to avoid npx overhead
- **Disable unused segments** for faster execution
- **Cache cleanup:** Remove `~/.claude/powerline/` if needed

## Custom Segments

Extend the statusline using shell composition:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y @owloops/claude-powerline && echo \" $(date +%H:%M)\"",
    "padding": 0
  }
}
```

> [!NOTE]  
> Use `tput` for colors: `setab <bg>` (background), `setaf <fg>` (foreground), `sgr0` (reset). Example: `echo "$(tput setab 4)$(tput setaf 15) text $(tput sgr0)"`. For complex logic, create a shell script with multiple commands, conditions, and variables.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for people who have contributed outside of GitHub PRs.

## License

This project is licensed under the [MIT License](LICENSE).
