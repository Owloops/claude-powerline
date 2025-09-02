#!/usr/bin/env node

import process from "node:process";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
import { json } from "node:stream/consumers";
import { PowerlineRenderer } from "./powerline";
import { loadConfigFromCLI } from "./config/loader";
import { debug } from "./utils/logger";
import type { ClaudeHookData } from "./utils/claude";

async function installFonts(): Promise<void> {
  try {
    const platform = os.platform();
    let fontDir: string;

    if (platform === "darwin") {
      fontDir = path.join(os.homedir(), "Library", "Fonts");
    } else if (platform === "linux") {
      fontDir = path.join(os.homedir(), ".local", "share", "fonts");
    } else if (platform === "win32") {
      fontDir = path.join(
        os.homedir(),
        "AppData",
        "Local",
        "Microsoft",
        "Windows",
        "Fonts"
      );
    } else {
      console.log("Unsupported platform for font installation");
      return;
    }

    if (!fs.existsSync(fontDir)) {
      fs.mkdirSync(fontDir, { recursive: true });
    }

    console.log("Installing Powerline Fonts...");
    console.log("Downloading from https://github.com/powerline/fonts");

    const tempDir = path.join(os.tmpdir(), "powerline-fonts");

    const cleanup = () => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }

      console.log("Cloning powerline fonts repository...");
      execSync(
        "git clone --depth=1 https://github.com/powerline/fonts.git powerline-fonts",
        {
          stdio: "inherit",
          cwd: os.tmpdir(),
        }
      );

      console.log("Installing fonts...");
      const installScript = path.join(tempDir, "install.sh");

      if (fs.existsSync(installScript)) {
        fs.chmodSync(installScript, 0o755);
        execSync("./install.sh", { stdio: "inherit", cwd: tempDir });
      } else {
        throw new Error(
          "Install script not found in powerline fonts repository"
        );
      }

      console.log("Powerline fonts installation complete!");
      console.log(
        "Please restart your terminal and set your terminal font to a powerline font."
      );
      console.log(
        "Popular choices: Source Code Pro Powerline, DejaVu Sans Mono Powerline, Ubuntu Mono Powerline"
      );
    } finally {
      cleanup();
      process.removeListener("SIGINT", cleanup);
      process.removeListener("SIGTERM", cleanup);
    }
  } catch (error) {
    console.error(
      "Error installing fonts:",
      error instanceof Error ? error.message : String(error)
    );
    console.log(
      "You can manually install fonts from: https://github.com/powerline/fonts"
    );
  }
}

function showHelpText(): void {
  console.log(`
claude-powerline - Beautiful powerline statusline for Claude Code

Usage: claude-powerline [options]

Standalone Commands:
  --install-fonts          Install powerline fonts to system
  -h, --help               Show this help

Debugging:
  CLAUDE_POWERLINE_DEBUG=1 Enable debug logging for troubleshooting

Claude Code Options (for settings.json):
  --theme=THEME            Set theme: dark, light, nord, tokyo-night, rose-pine, custom
  --style=STYLE            Set separator style: minimal, powerline, capsule
  --config=PATH            Use custom config file path

See example config at: https://github.com/Owloops/claude-powerline/blob/main/.claude-powerline.json

`);
}

async function main(): Promise<void> {
  try {
    const showHelp =
      process.argv.includes("--help") || process.argv.includes("-h");
    const installFontsFlag = process.argv.includes("--install-fonts");

    if (installFontsFlag) {
      await installFonts();
      process.exit(0);
    }

    if (showHelp) {
      showHelpText();
      process.exit(0);
    }

    if (process.stdin.isTTY === true) {
      console.error(`Error: This tool requires input from Claude Code

claude-powerline is designed to be used as a Claude Code statusLine command.
It reads hook data from stdin and outputs formatted statusline.

Add to ~/.claude/settings.json:
{
  "statusLine": {
    "type": "command",
    "command": "claude-powerline --style=powerline"
  }
}

Run with --help for more options.

To test output manually:
echo '{"session_id":"test-session","workspace":{"project_dir":"/path/to/project"},"model":{"id":"claude-3-5-sonnet","display_name":"Claude"}}' | claude-powerline --style=powerline`);
      process.exit(1);
    }

    debug(`Working directory: ${process.cwd()}`);
    debug(`Process args:`, process.argv);

    const hookData = (await json(process.stdin)) as ClaudeHookData;
    debug(`Received hook data:`, JSON.stringify(hookData, null, 2));

    if (!hookData) {
      console.error("Error: No input data received from stdin");
      showHelpText();
      process.exit(1);
    }

    const projectDir = hookData.workspace?.project_dir;
    const config = loadConfigFromCLI(process.argv, projectDir);
    const renderer = new PowerlineRenderer(config);
    const statusline = await renderer.generateStatusline(hookData);

    console.log(statusline);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error generating statusline:", errorMessage);
    process.exit(1);
  }
}

main();
