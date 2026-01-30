import { readFile } from "node:fs/promises";
import { existsSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join, dirname } from "node:path";
import { PricingService } from "./pricing";
import type { ClaudeHookData } from "../utils/claude";

// Performance constants (match HUD)
const MAX_TAIL_BYTES = 512 * 1024;      // 500KB tail limit
const MAX_AGENT_MAP_SIZE = 50;          // Soft cap (overflow allowed for running agents)
const STALE_AGENT_THRESHOLD_MS = 30 * 60 * 1000;  // 30 minutes
const MAX_DISPLAY_AGENTS = 10;          // Max agents to track for display

export interface OmcModeInfo {
  active: boolean;
  mode: 'ultrawork' | 'autopilot' | 'ecomode' | null;
}

export interface OmcRalphInfo {
  active: boolean;
  currentIteration: number | null;
  maxIterations: number | null;
}

export interface ActiveAgent {
  id: string;
  type: string;           // e.g., "oh-my-claudecode:executor"
  model?: string;         // haiku, sonnet, opus
  description?: string;
  status: 'running' | 'completed';  // Only two states - stale agents get synthetic completion
  startTime: Date;
  endTime?: Date;
  // Background agent ID (for transcript file lookup)
  bgAgentId?: string;     // Short alphanumeric ID (e.g., a8c7560) - used for transcript filename
  // Token tracking (populated from agent transcript file)
  tokens?: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };
  cost?: number;          // Calculated from tokens + model pricing
}

export interface OmcAgentsInfo {
  count: number;
  agents: ActiveAgent[];  // Full agent details
  agentType?: string;     // Keep for single-agent backward compatibility
}

export interface OmcSkillInfo {
  name: string | null;
  args?: string;
}

export interface OmcInfo {
  mode: OmcModeInfo;
  ralph: OmcRalphInfo;
  skill: OmcSkillInfo;
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

  /**
   * Read the tail portion of a file for large transcript handling.
   * Discards potentially incomplete first line when starting mid-file.
   */
  private readTailContent(filePath: string, fileSize: number): string {
    const startOffset = Math.max(0, fileSize - MAX_TAIL_BYTES);
    const bytesToRead = fileSize - startOffset;

    const fd = openSync(filePath, 'r');
    const buffer = Buffer.alloc(bytesToRead);

    try {
      readSync(fd, buffer, 0, bytesToRead, startOffset);
    } finally {
      closeSync(fd);
    }

    let content = buffer.toString('utf8');
    // Discard partial first line if we started mid-file
    // BUT only if the first char is NOT '{' (valid JSON start) - codex-1 fix
    if (startOffset > 0 && !content.startsWith('{')) {
      const firstNewline = content.indexOf('\n');
      if (firstNewline !== -1) {
        content = content.slice(firstNewline + 1);
      }
    }
    return content;
  }

  /**
   * Parse TaskOutput result for completion status.
   * Returns null if not a TaskOutput result.
   */
  private parseTaskOutputResult(content: unknown): { taskId: string; status: string } | null {
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.find((c: any) => c.type === 'text')?.text || ''
        : '';

    const taskIdMatch = text.match(/<task_id>([^<]+)<\/task_id>/);
    const statusMatch = text.match(/<status>([^<]+)<\/status>/);

    if (taskIdMatch && statusMatch) {
      return { taskId: taskIdMatch[1], status: statusMatch[1] };
    }
    return null;
  }

  /**
   * Parse task-notification system message for completion status.
   * Returns null if not a task-notification message.
   */
  private parseTaskNotification(content: unknown): { taskId: string; status: string } | null {
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((c: any) => c.type === 'text' ? c.text : '').join('')
        : '';

    const notificationMatch = text.match(/<task-notification>([\s\S]*?)<\/task-notification>/);
    if (!notificationMatch?.[1]) return null;

    const notificationContent = notificationMatch[1];
    const taskIdMatch = notificationContent.match(/<task-id>([^<]+)<\/task-id>/);
    const statusMatch = notificationContent.match(/<status>([^<]+)<\/status>/);

    if (taskIdMatch?.[1] && statusMatch?.[1]) {
      return { taskId: taskIdMatch[1].trim(), status: statusMatch[1].trim() };
    }
    return null;
  }

  /**
   * Check if a status represents terminal completion.
   */
  private isTerminalStatus(status: string): boolean {
    return ['completed', 'failed', 'error', 'cancelled'].includes(status.toLowerCase());
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

  /**
   * Combined parsing method that extracts both skill and agents info in a single pass.
   * This avoids reading/parsing the transcript twice.
   */
  private async parseTranscriptForSkillAndAgents(
    hookData: ClaudeHookData,
    options?: { needsAgentTokens?: boolean }
  ): Promise<{ skill: OmcSkillInfo; agents: OmcAgentsInfo }> {
    try {
      if (!hookData.transcript_path || !existsSync(hookData.transcript_path)) {
        return { skill: { name: null }, agents: { count: 0, agents: [] } };
      }

      // Check file size to determine parsing strategy
      const stat = statSync(hookData.transcript_path);
      const fileSize = stat.size;

      let content: string;
      if (fileSize > MAX_TAIL_BYTES) {
        content = this.readTailContent(hookData.transcript_path, fileSize);
      } else {
        content = await readFile(hookData.transcript_path, "utf-8");
      }
      const lines = content.trim().split("\n").filter(l => l.trim());

      let lastSkill: OmcSkillInfo = { name: null };
      const agentMap = new Map<string, ActiveAgent>();
      const backgroundAgentMap = new Map<string, string>(); // bgAgentId -> tool_use_id

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          // codex-2 fix: validate timestamp to avoid NaN in date math
          const parsedDate = entry.timestamp ? new Date(entry.timestamp) : new Date();
          const timestamp = isFinite(parsedDate.getTime()) ? parsedDate : new Date();

          if (Array.isArray(entry.message?.content)) {
            for (const block of entry.message.content) {
              // Track skills (both Skill and proxy_Skill)
              if (block.type === "tool_use" && (block.name === "Skill" || block.name === "proxy_Skill")) {
                const skillName = block.input?.skill;
                if (skillName) {
                  lastSkill = { name: skillName, args: block.input?.args };
                }
              }

              // Track agents (Task or proxy_Task) - guard block.id
              if (block.type === "tool_use" && block.id && (block.name === "Task" || block.name === "proxy_Task")) {
                const input = block.input as { subagent_type?: string; model?: string; description?: string } | undefined;

                const agentEntry: ActiveAgent = {
                  id: block.id,
                  type: input?.subagent_type ?? 'unknown',
                  model: input?.model,
                  description: input?.description,
                  status: 'running',
                  startTime: timestamp,
                };

                // Bounded map: soft cap with graceful overflow
                if (agentMap.size >= MAX_AGENT_MAP_SIZE) {
                  let oldestId: string | null = null;
                  let oldestTime = Infinity;
                  const evictionNow = Date.now();

                  // Priority 1: Find oldest completed agent
                  for (const [id, agent] of agentMap) {
                    if (agent.status === 'completed' && agent.startTime.getTime() < oldestTime) {
                      oldestTime = agent.startTime.getTime();
                      oldestId = id;
                    }
                  }

                  // Priority 2: Find oldest stale running (>30min)
                  if (!oldestId) {
                    oldestTime = Infinity;
                    for (const [id, agent] of agentMap) {
                      if (agent.status === 'running') {
                        const runningTime = evictionNow - agent.startTime.getTime();
                        if (runningTime > STALE_AGENT_THRESHOLD_MS && agent.startTime.getTime() < oldestTime) {
                          oldestTime = agent.startTime.getTime();
                          oldestId = id;
                        }
                      }
                    }
                  }

                  // Evict if candidate found, otherwise allow overflow
                  if (oldestId) {
                    agentMap.delete(oldestId);
                  }
                }

                agentMap.set(block.id, agentEntry);
              }

              // Track tool_result to mark agents completed
              if (block.type === "tool_result" && block.tool_use_id) {
                const agent = agentMap.get(block.tool_use_id);
                if (agent) {
                  const blockContent = block.content;

                  // Check for background agent launch
                  const isBackgroundLaunch =
                    typeof blockContent === 'string'
                      ? blockContent.includes('Async agent launched')
                      : Array.isArray(blockContent) && blockContent.some(
                          (c: { type?: string; text?: string }) =>
                            c.type === 'text' && c.text?.includes('Async agent launched')
                        );

                  if (isBackgroundLaunch) {
                    // CODEX-3 FIX: Search ALL text blocks for agentId, not just first one
                    const allText = typeof blockContent === 'string'
                      ? blockContent
                      : Array.isArray(blockContent)
                        ? blockContent
                            .filter((c: { type?: string; text?: string }) => c.type === 'text')
                            .map((c: { text?: string }) => c.text || '')
                            .join('\n')
                        : '';
                    const match = allText.match(/agentId:\s*([\w-]+)/);
                    if (match?.[1]) {
                      backgroundAgentMap.set(match[1], block.tool_use_id);
                      // Store bgAgentId on the agent for transcript file lookup
                      agent.bgAgentId = match[1];
                    }
                  } else {
                    // Foreground agent completed
                    agent.status = 'completed';
                    agent.endTime = timestamp;
                  }
                }

                // Check for TaskOutput completion (use isTerminalStatus for all terminal states)
                const taskOutput = this.parseTaskOutputResult(block.content);
                if (taskOutput && this.isTerminalStatus(taskOutput.status)) {
                  const toolUseId = backgroundAgentMap.get(taskOutput.taskId);
                  if (toolUseId) {
                    const bgAgent = agentMap.get(toolUseId);
                    if (bgAgent && bgAgent.status === 'running') {
                      bgAgent.status = 'completed';
                      bgAgent.endTime = timestamp;
                    }
                  }
                }
              }
            }
          }

          // Check for task-notification messages in BOTH entry.message.content AND entry.content
          const contentSources = [entry.message?.content, entry.content].filter(Boolean);
          for (const contentSource of contentSources) {
            const notification = this.parseTaskNotification(contentSource);
            if (notification && this.isTerminalStatus(notification.status)) {
              const toolUseId = backgroundAgentMap.get(notification.taskId);
              if (toolUseId) {
                const bgAgent = agentMap.get(toolUseId);
                if (bgAgent && bgAgent.status === 'running') {
                  bgAgent.status = 'completed';
                  bgAgent.endTime = timestamp;
                }
              }
            }
          }
        } catch {
          continue;
        }
      }

      // Handle stale agents: running >30 minutes get synthetic completion
      const now = Date.now();
      for (const agent of agentMap.values()) {
        if (agent.status === 'running') {
          const runningTime = now - agent.startTime.getTime();
          if (runningTime > STALE_AGENT_THRESHOLD_MS) {
            agent.status = 'completed';
            agent.endTime = new Date(agent.startTime.getTime() + STALE_AGENT_THRESHOLD_MS);
          }
        }
      }

      // Get running agents first, then recent completed (up to 10 total)
      const running = Array.from(agentMap.values()).filter(a => a.status === 'running');
      const completed = Array.from(agentMap.values()).filter(a => a.status === 'completed');
      const agents = [...running, ...completed.slice(-(MAX_DISPLAY_AGENTS - running.length))].slice(0, MAX_DISPLAY_AGENTS);

      // Enrich agents with token data only when explicitly needed (gated for performance)
      if (options?.needsAgentTokens) {
        const projectPath = hookData.transcript_path ? dirname(hookData.transcript_path) : null;
        if (projectPath) {
          await Promise.all(agents.map(async (agent) => {
            // Only background agents have bgAgentId set
            if (agent.bgAgentId) {
              const tokens = await this.getAgentTokens(agent.bgAgentId, projectPath);
              if (tokens) {
                agent.tokens = tokens;
                agent.cost = await this.calculateAgentCost(tokens, agent.model);
              }
            }
          }));
        }
      }

      const count = running.length;
      const firstAgent = running[0];
      const agentType = count === 1 && firstAgent ? (firstAgent.type.split(':').pop() ?? firstAgent.type) : undefined;

      return {
        skill: lastSkill,
        agents: { count, agents, agentType }
      };
    } catch {
      return { skill: { name: null }, agents: { count: 0, agents: [] } };
    }
  }

  /**
   * Sum tokens from an agent's transcript file.
   * Agent transcripts are at: {projectPath}/agent-{bgAgentId}.jsonl
   * (Matching the pattern used by findAgentTranscripts in claude.ts)
   */
  private async getAgentTokens(
    bgAgentId: string,
    projectPath: string
  ): Promise<{ input: number; output: number; cacheCreation: number; cacheRead: number } | null> {
    const agentPath = join(projectPath, `agent-${bgAgentId}.jsonl`);

    if (!existsSync(agentPath)) return null;

    try {
      const content = await readFile(agentPath, "utf-8");
      const lines = content.trim().split("\n").filter(l => l.trim());

      let input = 0, output = 0, cacheCreation = 0, cacheRead = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          // Only count assistant entries (they have usage data)
          if (entry.type === 'assistant' && entry.message?.usage) {
            const usage = entry.message.usage;
            input += usage.input_tokens || 0;
            output += usage.output_tokens || 0;
            cacheCreation += usage.cache_creation_input_tokens || 0;
            cacheRead += usage.cache_read_input_tokens || 0;
          }
        } catch {
          continue;
        }
      }

      // CODEX-2 FIX: Include cache tokens in presence check (cache-only usage is valid)
      if (input > 0 || output > 0 || cacheCreation > 0 || cacheRead > 0) {
        return { input, output, cacheCreation, cacheRead };
      }
    } catch {
      // File read error - return null
    }

    return null;
  }

  /**
   * Calculate cost for agent tokens using PricingService.
   */
  private async calculateAgentCost(
    tokens: { input: number; output: number; cacheCreation: number; cacheRead: number },
    model?: string
  ): Promise<number> {
    const modelId = model || 'claude-sonnet-4-20250514';  // Default to sonnet
    const pricing = await PricingService.getModelPricing(modelId);

    const inputCost = (tokens.input / 1_000_000) * pricing.input;
    const outputCost = (tokens.output / 1_000_000) * pricing.output;
    const cacheCreationCost = (tokens.cacheCreation / 1_000_000) * pricing.cache_write_5m;
    const cacheReadCost = (tokens.cacheRead / 1_000_000) * pricing.cache_read;

    return inputCost + outputCost + cacheCreationCost + cacheReadCost;
  }

  async getOmcInfo(
    hookData: ClaudeHookData,
    options?: { needsSkill?: boolean; needsAgents?: boolean; needsAgentTokens?: boolean }
  ): Promise<OmcInfo> {
    const cwd = hookData.workspace?.project_dir || hookData.cwd || process.cwd();

    // Only parse transcript if skill or agents are needed
    const needsTranscript = options?.needsSkill || options?.needsAgents;
    const transcriptData = needsTranscript
      ? await this.parseTranscriptForSkillAndAgents(hookData, {
          needsAgentTokens: options?.needsAgentTokens,
        })
      : { skill: { name: null }, agents: { count: 0, agents: [] } };

    const [mode, ralph] = await Promise.all([
      this.getModeInfo(cwd),
      this.getRalphInfo(cwd),
    ]);

    return {
      mode,
      ralph,
      skill: transcriptData.skill,
      agents: transcriptData.agents,
    };
  }
}
