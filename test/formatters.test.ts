import {
  collapseHome,
  formatDuration,
  formatModelName,
  formatTokens,
  pathBelow,
} from "../src/utils/formatters";

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

  describe("Fable and Mythos models", () => {
    it("should parse Fable and Mythos API model IDs", () => {
      expect(formatModelName("claude-fable-5")).toBe("Fable 5");
      expect(formatModelName("claude-mythos-5")).toBe("Mythos 5");
    });

    it("should parse Fable and Mythos gateway model IDs", () => {
      expect(formatModelName("anthropic.claude-fable-5")).toBe("Fable 5");
      expect(formatModelName("us.anthropic.claude-mythos-5")).toBe("Mythos 5");
      expect(formatModelName("vertex_ai/claude-fable-5")).toBe("Fable 5");
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

describe("formatTokens", () => {
  it("formats values within a unit", () => {
    expect(formatTokens(999)).toBe("999 tokens");
    expect(formatTokens(1_500)).toBe("1.5K tokens");
    expect(formatTokens(999_949)).toBe("999.9K tokens");
    expect(formatTokens(2_500_000)).toBe("2.5M tokens");
  });

  it("promotes to M when rounding would reach 1000.0K", () => {
    expect(formatTokens(999_950)).toBe("1.0M tokens");
    expect(formatTokens(999_999)).toBe("1.0M tokens");
  });
});

describe("formatDuration", () => {
  it("formats values within a unit", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(59.4)).toBe("59s");
    expect(formatDuration(3569)).toBe("59m");
    expect(formatDuration(5400)).toBe("1.5h");
    expect(formatDuration(129600)).toBe("1.5d");
  });

  it("promotes to the next unit when rounding would reach its boundary", () => {
    expect(formatDuration(59.6)).toBe("1m");
    expect(formatDuration(3599)).toBe("1.0h");
    expect(formatDuration(86399)).toBe("1.0d");
  });
});

describe("pathBelow", () => {
  it("returns the remainder below the base", () => {
    expect(pathBelow("/home/al", "/home/al")).toBe("");
    expect(pathBelow("/home/al/proj", "/home/al")).toBe("/proj");
    expect(pathBelow("C:\\Users\\al\\proj", "C:\\Users\\al")).toBe("\\proj");
  });

  it("matches whole segments only", () => {
    expect(pathBelow("/home/alex/proj", "/home/al")).toBeNull();
    expect(pathBelow("/srv/app-web", "/srv/app")).toBeNull();
  });

  it("ignores trailing separators on the base", () => {
    expect(pathBelow("/home/al/proj", "/home/al/")).toBe("/proj");
    expect(pathBelow("/home/al", "/home/al/")).toBe("");
    expect(pathBelow("C:\\Users\\al\\proj", "C:\\Users\\al\\")).toBe("\\proj");
    expect(pathBelow("/home/alex", "/home/al/")).toBeNull();
  });

  it("treats a root base as matching only itself", () => {
    expect(pathBelow("/", "/")).toBe("");
    expect(pathBelow("/home/al", "/")).toBeNull();
  });
});

describe("collapseHome", () => {
  it("collapses paths under a home dir with a trailing separator", () => {
    expect(collapseHome("/home/al/proj", "/home/al/")).toBe("~/proj");
    expect(collapseHome("/home/al", "/home/al/")).toBe("~");
    expect(collapseHome("C:\\Users\\al\\proj", "C:\\Users\\al\\")).toBe(
      "~\\proj",
    );
  });

  it("leaves paths outside home unchanged", () => {
    expect(collapseHome("/home/alex/proj", "/home/al/")).toBe(
      "/home/alex/proj",
    );
    expect(collapseHome("/home/al/proj", "/")).toBe("/home/al/proj");
  });
});
