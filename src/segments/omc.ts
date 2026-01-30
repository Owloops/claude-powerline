import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ClaudeHookData } from "../utils/claude";

export interface OmcModeInfo {
  active: boolean;
  mode: 'ultrawork' | 'autopilot' | 'ecomode' | null;
}

export interface OmcRalphInfo {
  active: boolean;
  currentIteration: number | null;
  maxIterations: number | null;
}

export interface OmcAgentsInfo {
  count: number;
}

export interface OmcInfo {
  mode: OmcModeInfo;
  ralph: OmcRalphInfo;
  agents: OmcAgentsInfo;
}

export class OmcProvider {
  private async readStateFile<T>(filePath: string): Promise<T | null> {
    try {
      if (!existsSync(filePath)) {
        return null;
      }
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  private async getModeInfo(cwd: string): Promise<OmcModeInfo> {
    const omcDir = join(cwd, ".omc");

    // Check ultrawork
    const ultraworkState = await this.readStateFile<{ active?: boolean }>(
      join(omcDir, "ultrawork-state.json")
    );
    if (ultraworkState?.active) {
      return { active: true, mode: 'ultrawork' };
    }

    // Check autopilot
    const autopilotState = await this.readStateFile<{ active?: boolean }>(
      join(omcDir, "autopilot-state.json")
    );
    if (autopilotState?.active) {
      return { active: true, mode: 'autopilot' };
    }

    // Check ecomode
    const ecomodeState = await this.readStateFile<{ active?: boolean }>(
      join(omcDir, "ecomode-state.json")
    );
    if (ecomodeState?.active) {
      return { active: true, mode: 'ecomode' };
    }

    return { active: false, mode: null };
  }

  private async getRalphInfo(cwd: string): Promise<OmcRalphInfo> {
    const omcDir = join(cwd, ".omc");
    const ralphState = await this.readStateFile<{
      active?: boolean;
      iteration?: number;
      maxIterations?: number;
    }>(join(omcDir, "ralph-state.json"));

    if (!ralphState?.active) {
      return { active: false, currentIteration: null, maxIterations: null };
    }

    return {
      active: true,
      currentIteration: ralphState.iteration ?? null,
      maxIterations: ralphState.maxIterations ?? 10,
    };
  }

  private async getAgentsInfo(hookData: ClaudeHookData): Promise<OmcAgentsInfo> {
    try {
      if (!hookData.transcript_path || !existsSync(hookData.transcript_path)) {
        return { count: 0 };
      }

      const content = await readFile(hookData.transcript_path, "utf-8");
      const lines = content.trim().split("\n").filter(l => l.trim());

      const runningAgents = new Set<string>();

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (Array.isArray(entry.message?.content)) {
            for (const block of entry.message.content) {
              if (block.type === "tool_use" && block.name === "Task") {
                runningAgents.add(block.id);
              }
              if (block.type === "tool_result" && runningAgents.has(block.tool_use_id)) {
                runningAgents.delete(block.tool_use_id);
              }
            }
          }
        } catch {
          continue;
        }
      }

      return { count: runningAgents.size };
    } catch {
      return { count: 0 };
    }
  }

  async getOmcInfo(hookData: ClaudeHookData): Promise<OmcInfo> {
    const cwd = hookData.workspace?.project_dir || hookData.cwd || process.cwd();

    const [mode, ralph, agents] = await Promise.all([
      this.getModeInfo(cwd),
      this.getRalphInfo(cwd),
      this.getAgentsInfo(hookData),
    ]);

    return { mode, ralph, agents };
  }
}
