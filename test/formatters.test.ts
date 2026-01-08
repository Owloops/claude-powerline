import { formatModelName } from "../src/utils/formatters";

describe("formatModelName", () => {
  describe("AWS Bedrock models", () => {
    it("should parse standard Bedrock model IDs", () => {
      expect(formatModelName("anthropic.claude-opus-4-5-20251101-v1:0")).toBe(
        "Opus 4.5",
      );
      expect(formatModelName("anthropic.claude-sonnet-4-5-20250929-v1:0")).toBe(
        "Sonnet 4.5",
      );
      expect(formatModelName("anthropic.claude-haiku-4-5-20251001-v1:0")).toBe(
        "Haiku 4.5",
      );
    });

    it("should parse regional Bedrock model IDs", () => {
      expect(
        formatModelName("global.anthropic.claude-opus-4-5-20251101-v1:0"),
      ).toBe("Opus 4.5");
      expect(
        formatModelName("apac.anthropic.claude-sonnet-4-5-20250929-v1:0"),
      ).toBe("Sonnet 4.5");
      expect(
        formatModelName("au.anthropic.claude-haiku-4-5-20251001-v1:0"),
      ).toBe("Haiku 4.5");
      expect(
        formatModelName("eu.anthropic.claude-opus-4-1-20250805-v1:0"),
      ).toBe("Opus 4.1");
      expect(
        formatModelName("us.anthropic.claude-sonnet-4-20250514-v1:0"),
      ).toBe("Sonnet 4");
    });

    it("should parse old-format Claude 3 Bedrock model IDs", () => {
      expect(formatModelName("anthropic.claude-3-5-sonnet-20241022-v2:0")).toBe(
        "Sonnet 3.5",
      );
      expect(formatModelName("anthropic.claude-3-7-sonnet-20250219-v1:0")).toBe(
        "Sonnet 3.7",
      );
      expect(formatModelName("anthropic.claude-3-opus-20240229-v1:0")).toBe(
        "Opus 3",
      );
      expect(formatModelName("anthropic.claude-3-haiku-20240307-v1:0")).toBe(
        "Haiku 3",
      );
      expect(formatModelName("anthropic.claude-3-sonnet-20240229-v1:0")).toBe(
        "Sonnet 3",
      );
    });

  });

  describe("GCP Vertex AI models", () => {
    it("should parse Vertex AI model IDs with @ date separator", () => {
      expect(formatModelName("claude-sonnet-4-5@20250929")).toBe("Sonnet 4.5");
      expect(formatModelName("claude-haiku-4-5@20251001")).toBe("Haiku 4.5");
      expect(formatModelName("claude-opus-4-5@20251101")).toBe("Opus 4.5");
      expect(formatModelName("claude-opus-4-1@20250805")).toBe("Opus 4.1");
      expect(formatModelName("claude-sonnet-4@20250514")).toBe("Sonnet 4");
    });

    it("should parse old-format Vertex AI model IDs", () => {
      expect(formatModelName("claude-3-7-sonnet@20250219")).toBe("Sonnet 3.7");
      expect(formatModelName("claude-3-haiku@20240307")).toBe("Haiku 3");
      expect(formatModelName("claude-3-opus@20240229")).toBe("Opus 3");
    });

    it("should parse Vertex AI model IDs with prefix", () => {
      expect(formatModelName("vertex_ai/claude-sonnet-4-5@20250929")).toBe(
        "Sonnet 4.5",
      );
      expect(formatModelName("vertex_ai/claude-opus-4-5@20251101")).toBe(
        "Opus 4.5",
      );
    });
  });

  describe("Azure AI models", () => {
    it("should parse Azure AI model IDs", () => {
      expect(formatModelName("azure_ai/claude-haiku-4-5")).toBe("Haiku 4.5");
      expect(formatModelName("azure_ai/claude-opus-4-1")).toBe("Opus 4.1");
      expect(formatModelName("azure_ai/claude-sonnet-4-5")).toBe("Sonnet 4.5");
    });
  });

  describe("Direct Anthropic API models", () => {
    it("should parse new-format API model IDs", () => {
      expect(formatModelName("claude-sonnet-4-5-20250929")).toBe("Sonnet 4.5");
      expect(formatModelName("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
      expect(formatModelName("claude-opus-4-5-20251101")).toBe("Opus 4.5");
      expect(formatModelName("claude-opus-4-1-20250805")).toBe("Opus 4.1");
      expect(formatModelName("claude-sonnet-4-20250514")).toBe("Sonnet 4");
      expect(formatModelName("claude-opus-4-20250514")).toBe("Opus 4");
    });

    it("should parse API aliases", () => {
      expect(formatModelName("claude-sonnet-4-5")).toBe("Sonnet 4.5");
      expect(formatModelName("claude-haiku-4-5")).toBe("Haiku 4.5");
      expect(formatModelName("claude-opus-4-5")).toBe("Opus 4.5");
      expect(formatModelName("claude-opus-4-1")).toBe("Opus 4.1");
      expect(formatModelName("claude-sonnet-4-0")).toBe("Sonnet 4.0");
      expect(formatModelName("claude-opus-4-0")).toBe("Opus 4.0");
    });

    it("should parse old-format API model IDs", () => {
      expect(formatModelName("claude-3-5-sonnet-20241022")).toBe("Sonnet 3.5");
      expect(formatModelName("claude-3-7-sonnet-20250219")).toBe("Sonnet 3.7");
      expect(formatModelName("claude-3-opus-20240229")).toBe("Opus 3");
      expect(formatModelName("claude-3-haiku-20240307")).toBe("Haiku 3");
      expect(formatModelName("claude-3-7-sonnet-latest")).toBe("Sonnet 3.7");
    });
  });

  describe("Edge cases", () => {
    it("should return fallback for empty or null input", () => {
      expect(formatModelName("")).toBe("Claude");
      expect(formatModelName(null as unknown as string)).toBe("Claude");
      expect(formatModelName(undefined as unknown as string)).toBe("Claude");
    });

    it("should pass through already-friendly names", () => {
      expect(formatModelName("Claude")).toBe("Claude");
      expect(formatModelName("Claude Opus")).toBe("Claude Opus");
      expect(formatModelName("Claude Sonnet")).toBe("Claude Sonnet");
    });

    it("should pass through unknown model formats", () => {
      expect(formatModelName("some-unknown-model")).toBe("some-unknown-model");
      expect(formatModelName("custom-enterprise-model-v2")).toBe(
        "custom-enterprise-model-v2",
      );
    });

    it("should handle whitespace", () => {
      expect(formatModelName("  claude-opus-4-5  ")).toBe("Opus 4.5");
      expect(
        formatModelName("  anthropic.claude-sonnet-4-5-20250929-v1:0  "),
      ).toBe("Sonnet 4.5");
    });
  });
});
