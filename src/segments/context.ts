import { readFileSync } from "node:fs";
import { debug } from "../utils/logger";
import { parseJsonlFile, type ParsedEntry, type ClaudeHookData } from "../utils/claude";
import type { PowerlineConfig } from "../config/loader";

export interface ContextInfo {
	totalTokens: number;
	percentage: number;
	usablePercentage: number;
	contextLeftPercentage: number;
	maxTokens: number;
	usableTokens: number;
}

interface ContextUsageThresholds {
	LOW: number;
	MEDIUM: number;
}

export class ContextProvider {
	private readonly thresholds: ContextUsageThresholds = {
		LOW: 50,
		MEDIUM: 80,
	};
	private readonly config: PowerlineConfig;

	constructor(config: PowerlineConfig) {
		this.config = config;
	}

	getContextUsageThresholds(): ContextUsageThresholds {
		return this.thresholds;
	}

	private getContextLimit(modelId: string): number {
		const modelLimits = this.config.modelContextLimits || { default: 200000 };
		const modelType = this.getModelType(modelId);
		return modelLimits[modelType] || modelLimits.default || 200000;
	}

	private getModelType(modelId: string): string {
		const id = modelId.toLowerCase();

		if (id.includes("sonnet")) {
			return "sonnet";
		}
		if (id.includes("opus")) {
			return "opus";
		}

		return "default";
	}

	private calculatePercentages(
		totalTokens: number,
		contextLimit: number
	): Pick<ContextInfo, "percentage" | "usablePercentage" | "contextLeftPercentage" | "usableTokens"> {
		const percentage = Math.min(
			100,
			Math.max(0, Math.round((totalTokens / contextLimit) * 100))
		);

		const usableLimit = Math.round(contextLimit * 0.75);
		const usablePercentage = Math.min(
			100,
			Math.max(0, Math.round((totalTokens / usableLimit) * 100))
		);

		const contextLeftPercentage = Math.max(0, 100 - usablePercentage);

		return {
			percentage,
			usablePercentage,
			contextLeftPercentage,
			usableTokens: usableLimit,
		};
	}

	/**
	 * Calculate context info from native Claude Code context_window data (preferred).
	 * Available in Claude Code 2.0.65+
	 */
	calculateContextFromHookData(hookData: ClaudeHookData): ContextInfo | null {
		const contextWindow = hookData.context_window;
		if (!contextWindow) {
			debug("No context_window in hook data, falling back to transcript parsing");
			return null;
		}

		debug(
			`Native context data: input=${contextWindow.total_input_tokens}, output=${contextWindow.total_output_tokens}, size=${contextWindow.context_window_size}`
		);

		const totalTokens =
			(contextWindow.total_input_tokens || 0) +
			(contextWindow.total_output_tokens || 0);
		const contextLimit = contextWindow.context_window_size || 200000;

		debug(
			`Using native context_window: ${totalTokens} tokens (limit: ${contextLimit})`
		);

		const percentages = this.calculatePercentages(totalTokens, contextLimit);

		return {
			totalTokens,
			maxTokens: contextLimit,
			...percentages,
		};
	}

	/**
	 * Calculate context tokens by parsing the transcript file (fallback).
	 * Used for older Claude Code versions that don't provide context_window.
	 */
	async calculateContextTokensFromTranscript(
		transcriptPath: string,
		modelId?: string
	): Promise<ContextInfo | null> {
		try {
			debug(`Calculating context tokens from transcript: ${transcriptPath}`);

			try {
				const content = readFileSync(transcriptPath, "utf-8");
				if (!content) {
					debug("Transcript file is empty");
					return null;
				}
			} catch {
				debug("Could not read transcript file");
				return null;
			}

			const parsedEntries = await parseJsonlFile(transcriptPath);

			if (parsedEntries.length === 0) {
				debug("No entries in transcript");
				return null;
			}

			let mostRecentEntry: ParsedEntry | null = null;

			for (let i = parsedEntries.length - 1; i >= 0; i--) {
				const entry = parsedEntries[i];
				if (!entry) continue;

				if (!entry.message?.usage?.input_tokens) continue;
				if (entry.isSidechain === true) continue;

				mostRecentEntry = entry;
				debug(
					`Context segment: Found most recent entry at ${entry.timestamp.toISOString()}, stopping search`
				);
				break;
			}

			if (mostRecentEntry?.message?.usage) {
				const usage = mostRecentEntry.message.usage;
				// For transcript fallback, we include input + output tokens to match native behavior
				const totalTokens =
					(usage.input_tokens || 0) +
					(usage.output_tokens || 0) +
					(usage.cache_read_input_tokens || 0) +
					(usage.cache_creation_input_tokens || 0);

				const contextLimit = modelId ? this.getContextLimit(modelId) : 200000;

				debug(
					`Most recent main chain context: ${totalTokens} tokens (limit: ${contextLimit})`
				);

				const percentages = this.calculatePercentages(totalTokens, contextLimit);

				return {
					totalTokens,
					maxTokens: contextLimit,
					...percentages,
				};
			}

			debug("No main chain entries with usage data found");
			return null;
		} catch (error) {
			debug(
				`Error reading transcript: ${error instanceof Error ? error.message : String(error)}`
			);
			return null;
		}
	}

	/**
	 * Get context info using native data if available, falling back to transcript parsing.
	 */
	async getContextInfo(hookData: ClaudeHookData): Promise<ContextInfo | null> {
		// Try native context_window first (Claude Code 2.0.65+)
		const nativeContext = this.calculateContextFromHookData(hookData);
		if (nativeContext) {
			return nativeContext;
		}

		// Fall back to transcript parsing for older versions
		return this.calculateContextTokensFromTranscript(
			hookData.transcript_path,
			hookData.model?.id
		);
	}
}
