---
name: powerline
description: Claude Powerline statusline setup wizard
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - AskUserQuestion
  - Glob
---

# Claude Powerline Setup Wizard

You are running an interactive setup wizard to configure the claude-powerline statusline for Claude Code. Follow these steps in order, using AskUserQuestion for each decision point.

## Important Notes

- Do not skip steps or combine questions.
- Always wait for the user's response before moving to the next step.
- Track the user's choices in variables throughout the wizard.
- The final config is written as JSON to `~/.claude/claude-powerline.json`.
- Do NOT use the Agent tool or Explore subagents. All information you need is in this document.
- Do NOT read source code from the claude-powerline package. Use only the instructions below.
- IMPORTANT: After running any Bash or Read tool, repeat the key output as text in your response. Some users have a collapsed UI mode where tool outputs require a click to expand. Always relay important results (like version numbers, previews, or file contents) in your text so the user can see them without expanding.

## Step 1: Check Node.js

Run this command to check if Node.js 18+ is available:

```bash
node --version 2>/dev/null || echo "not_installed"
```

Tell the user the detected version in your text response.

### If Node.js is NOT installed or version is below 18

Display:

````markdown
Claude Powerline requires **Node.js 18+** to run.

Install it from https://nodejs.org or via your package manager:

```bash
# macOS
brew install node

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```
````

Then ask:

- **Question**: "Install Node.js or check again?"
- **Header**: "Node.js"
- **Options**:
  - "I installed it, check again" -> Re-run the version check from the top of Step 1
  - "Exit wizard" -> Tell them to install Node.js 18+ and exit

### If Node.js 18+ IS installed

Continue to the next step.

## Step 2: Nerd Font Detection

> [!IMPORTANT]
> You cannot display nerd font glyphs properly in your text output.
> You MUST run the cat command below and let the terminal render it.
> After running it, tell the user to expand the bash output if they cannot see the icons.

```bash
cat ${CLAUDE_PLUGIN_ROOT}/templates/nerd-fonts-sample.txt
```

After running the command, tell the user: "Check the bash output above for Nerd Font icons (folder, code, branch, robot). You may need to click/expand the bash output to see them."

Then ask:

- **Question**: "Can you see the icons clearly (folder, code, branch, robot)?"
- **Header**: "Nerd Font"
- **Options**:
  - "Yes, I can see them" -> Set `charset=unicode`. Continue to Step 3
  - "No, I see boxes or blank spaces" -> Set `charset=text`. Continue to Step 3

## Step 3: Theme Selection

Show a preview of all six themes using the bundled preview script.

> [!IMPORTANT]
> You cannot render ANSI escape codes in your text output.
> You MUST run the preview command below and let the terminal display the result.
> After running, tell the user to expand the bash output if they cannot see the previews.

```bash
${CLAUDE_PLUGIN_ROOT}/bin/preview.sh --compare-themes --charset=${charset}
```

After running the command, display the theme list and tell the user to check the bash output above for previews:

````markdown
**Available themes:**

1. **dark** -- Dark background, high contrast (default)
2. **light** -- Light background for light terminals
3. **nord** -- Cool blue palette inspired by Arctic colors
4. **tokyo-night** -- Modern dark theme with vibrant accents
5. **rose-pine** -- Soft, muted palette with rose and pine tones
6. **gruvbox** -- Warm retro colors with earthy tones
````

Then ask:

- **Question**: "Which theme? Type a name or pick from the list."
- **Header**: "Theme"
- **Options**:
  - "dark" -> Set `chosen_theme=dark`
  - "light" -> Set `chosen_theme=light`
  - "nord" -> Set `chosen_theme=nord`
  - "tokyo-night" -> Set `chosen_theme=tokyo-night`

If the user types "rose-pine" or "gruvbox" (or any valid theme name) in the free text field, accept that as their choice. Valid themes: dark, light, nord, tokyo-night, rose-pine, gruvbox.

## Step 4: Style Selection

Show a preview of all four styles using the bundled preview script.

> [!IMPORTANT]
> You cannot render ANSI escape codes or nerd font glyphs in your text output.
> You MUST run the preview command below and let the terminal display the result.
> Do NOT attempt to describe what the styles look like. Let the user see them.
> After running, tell the user to expand the bash output if they cannot see the previews.

```bash
${CLAUDE_PLUGIN_ROOT}/bin/preview.sh --compare-styles --theme=${chosen_theme} --charset=${charset}
```

After running the command, tell the user: "The four style previews are in the bash output above. Expand it if needed."

Then ask:

- **Question**: "Which style do you prefer?"
- **Header**: "Style"
- **Options**:
  - "minimal" -> Set `chosen_style=minimal`
  - "powerline" -> Set `chosen_style=powerline`
  - "capsule" -> Set `chosen_style=capsule`
  - "tui" -> Set `chosen_style=tui`

If the user chose `charset=text`, add a note that powerline and capsule use text fallback separators.

**If the user chose "tui":** skip Steps 5 and 6 and continue to Step 4b for TUI layout selection.

## Step 4b: TUI Layout Selection

> [!NOTE]
> This step only applies if the user chose "tui" style in Step 4. Otherwise skip to Step 5.

Show a preview of all three TUI layouts using the bundled preview script.

> [!IMPORTANT]
> You MUST run the preview command below and let the terminal display the result.
> After running, tell the user to expand the bash output if they cannot see the previews.

```bash
${CLAUDE_PLUGIN_ROOT}/bin/preview.sh --compare-tui-layouts --theme=${chosen_theme} --charset=${charset}
```

After running the command, tell the user: "The three TUI layout previews are in the bash output above. Expand it if needed."

Display the three TUI layout presets:

````markdown
**Choose a TUI layout:**

1. **Compact** — Git + context window only
   Minimal footprint. Model name in the title bar. Clean and focused.

2. **Standard** — Git + context + block usage with progress bars
   Model and directory in the title bar. Good default for most users.

3. **Full** — Git, context, block, session, and daily cost
   Title bar with model and directory. Footer with weekly usage and response time.
   Maximum information density.
````

Then ask:

- **Question**: "Which TUI layout?"
- **Header**: "TUI Layout"
- **Options**:
  - "Compact" -> Set `chosen_tui_layout=compact`
  - "Standard" -> Set `chosen_tui_layout=standard`
  - "Full" -> Set `chosen_tui_layout=full`

After selection, skip Steps 5 and 6 (always skipped for TUI). If "Compact" or "Standard", also skip Step 7 (no budget needed). If "Full", continue to Step 7.

### TUI preset to template mapping

- `compact` -> `config-tui-compact.json`
- `standard` -> `config-tui-standard.json`
- `full` -> `config-tui-full.json`

## Step 5: Segment Selection

> [!NOTE]
> Skip this step if the user chose "tui" style.

Display the three presets:

````markdown
**Choose a segment preset:**

1. **Essential** -- Directory, git, model, context window
   Clean and lightweight. Just the basics.

2. **Standard** -- Essential + session cost, daily cost tracking
   Adds cost visibility without clutter. Good default for most users.

3. **Full** -- Standard + block usage, metrics, version, weekly usage
   Everything on. For users who want maximum information density.
````

Then ask:

- **Question**: "Which segment preset?"
- **Header**: "Segments"
- **Options**:
  - "Essential" -> Set `chosen_preset=essential`
  - "Standard" -> Set `chosen_preset=standard`
  - "Full" -> Set `chosen_preset=full`

### Preset to template mapping

Each preset has a corresponding template config file in `${CLAUDE_PLUGIN_ROOT}/templates/`:

- `essential` -> `config-essential.json`
- `standard` -> `config-standard.json`
- `full` -> `config-full.json`

For TUI templates, see Step 4b.

## Step 6: Bar Display Style

> [!NOTE]
> Skip this step if the user chose "tui" style. Default to `text` if skipped.

Display the available bar styles for progress indicators (used by context, block, and weekly segments):

````markdown
**Bar display styles** (for context window, block usage, and weekly usage):

1. **text** -- Numbers only, no bar (default). Example: `65,000 (61%)`
2. **bar** -- Classic bar. Example: `▓▓▓▓▓░░░░░ 50%`
3. **blocks** -- Block fill. Example: `█████░░░░░ 50%`
4. **dots** -- Dot fill. Example: `●●●●●○○○○○ 50%`
5. **geometric** -- Geometric. Example: `▰▰▰▰▰▱▱▱▱▱ 50%`
6. **line** -- Line style. Example: `━━━━━┄┄┄┄┄ 50%`
````

Then ask:

- **Question**: "Which bar style for progress indicators?"
- **Header**: "Display Style"
- **Options**:
  - "text" -> Set `chosen_bar_style=text`
  - "bar" -> Set `chosen_bar_style=bar`
  - "blocks" -> Set `chosen_bar_style=blocks`
  - "dots" -> Set `chosen_bar_style=dots`

If the user types "geometric", "line", "filled", "squares", "capped", "ball", or "blocks-line" in the free text field, accept that as their choice. All valid display styles: text, ball, bar, blocks, blocks-line, capped, dots, filled, geometric, line, squares.

Apply `chosen_bar_style` to the `displayStyle` field of context, block, and weekly segments in the config.

## Step 7: Budget

> [!NOTE]
> Skip this step if the user chose "Essential" preset, or TUI "Compact" or "Standard" layout. Only TUI "Full" layout uses a budget placeholder.

Ask the user about their daily budget for cost tracking:

- **Question**: "Set a daily spending budget? (used by the today segment for percentage warnings)"
- **Header**: "Budget"
- **Options**:
  - "$25/day" -> Set `today_budget=25`
  - "$50/day" -> Set `today_budget=50`
  - "$100/day" -> Set `today_budget=100`
  - "No budget" -> Set `today_budget=null` (omit amount from config)

## Step 8: Write Configuration

### Check for existing config

```bash
test -f ~/.claude/claude-powerline.json && echo "exists" || echo "not_found"
```

If it exists, ask:

- **Question**: "Found existing ~/.claude/claude-powerline.json. What should I do?"
- **Header**: "Existing Config"
- **Options**:
  - "Replace it" -> Continue
  - "Back it up first" -> Run `cp ~/.claude/claude-powerline.json ~/.claude/claude-powerline.json.bak` then continue
  - "Keep it and exit" -> Exit the wizard

### Build and write the config

1. **Pick the template file.** Based on the user's choices:
   - Non-TUI styles: `config-essential.json`, `config-standard.json`, or `config-full.json` (from Step 5)
   - TUI style: `config-tui-compact.json`, `config-tui-standard.json`, or `config-tui-full.json` (from Step 4b)

2. **Read the template** using the Read tool:

```text
${CLAUDE_PLUGIN_ROOT}/templates/<template-file>
```

1. **Replace placeholders** in the template content:

   | Placeholder | Replace with |
   |-------------|-------------|
   | `replace:THEME` | The chosen theme (e.g., `tokyo-night`) |
   | `replace:STYLE` | The chosen style (e.g., `capsule`). Not present in TUI templates. |
   | `replace:CHARSET` | `unicode` or `text` |
   | `replace:BAR_STYLE` | The chosen bar style (e.g., `blocks`). Default `text` if Step 6 was skipped. Not present in TUI templates. |
   | `replace:TODAY_BUDGET` | The budget number (e.g., `50`). Only present in non-TUI standard/full and TUI full templates. **Important:** replace `"replace:TODAY_BUDGET"` (including the surrounding quotes) with the bare number so the result is `"amount": 50` not `"amount": "50"`. |

1. **Handle "No budget"**: If the user chose "No budget" in Step 7, remove the entire `"amount": "replace:TODAY_BUDGET",` line (including the trailing comma) from the budget section. If Step 7 was skipped (essential preset, or TUI compact/standard), do not modify the budget section.

1. **Write the result** to `~/.claude/claude-powerline.json` using the Write tool. Do NOT read or merge with any existing config.

## Step 9: Update settings.json

Read `~/.claude/settings.json` if it exists. Add or update ONLY the `statusLine` key:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y @owloops/claude-powerline@latest"
  }
}
```

If the file does not exist, create it with only the statusLine configuration.
If it exists, preserve ALL other settings (hooks, permissions, plugins, etc.) and only add or update the `statusLine` key.

Use the Read tool to load the existing file, merge the statusLine key, and Write to save it back.

## Step 10: Test Installation

Run a test with sample data to verify the statusline renders:

> [!IMPORTANT]
> You MUST run this command and tell the user to check the output.

```bash
${CLAUDE_PLUGIN_ROOT}/bin/preview.sh --theme=${chosen_theme} --style=${chosen_style} --charset=${charset}
```

Tell the user: "Check the bash output above for your statusline preview. Expand it if needed."

If it produced output, tell the user the setup is working.

## Step 11: Success Message

Display:

````markdown
Setup complete.

**Files created/updated:**
- `~/.claude/claude-powerline.json` (powerline config)
- `~/.claude/settings.json` (claude settings)

**What now:**
1. Restart Claude Code if the statusline does not appear.
2. Run `/powerline` any time to reconfigure.
3. Edit `~/.claude/claude-powerline.json` by hand for advanced options.

Documentation: https://github.com/Owloops/claude-powerline
````

**If the user chose TUI style**, also display:

````markdown
**Customizing your TUI grid layout:**

Edit `display.tui` in `~/.claude/claude-powerline.json` to fine-tune:

- **Box style** — Add `"box": "rounded"` to change borders. Presets: `rounded`, `square`, `heavy`, `double`, `dashed`, `heavy-dashed`, `mixed`, `ascii`, `invisible`
- **Title/footer** — Edit `title.left`, `title.right`, `footer.left`, `footer.right` using `{segment.part}` tokens (e.g. `{model.icon}`, `{dir}`, `{weekly.pct}`)
- **Grid areas** — Rearrange cells in `breakpoints[].areas`. Use `.` for empty cells, `---` for dividers. Repeat a name across adjacent cells to span columns
- **Custom colors** — Add `colors.custom` entries with dot-notation keys (e.g. `"context.bar": { "fg": "#4a9eff" }`)
- **Responsive breakpoints** — Add breakpoints for different terminal widths. The engine picks the largest `minWidth` that fits
- **Column sizing** — `"auto"` (fit content), `"1fr"` (fill remaining), or a fixed number like `"20"`

See the TUI Grid Layout section in the README for the full reference.
````
