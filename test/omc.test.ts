import { OmcProvider } from "../src/segments/omc";

describe("OmcProvider", () => {
  let provider: OmcProvider;

  beforeEach(() => {
    provider = new OmcProvider();
  });

  describe("parseTaskNotification (via integration)", () => {
    // Note: parseTaskNotification is private, so we test it indirectly
    // through the transcript parsing behavior or via type assertion

    it("should parse completed task-notification", () => {
      // Access private method for testing
      const parseTaskNotification = (provider as any).parseTaskNotification.bind(provider);

      const content = `<task-notification>
<task-id>abc123</task-id>
<status>completed</status>
</task-notification>`;

      const result = parseTaskNotification(content);
      expect(result).toEqual({ taskId: "abc123", status: "completed" });
    });

    it("should parse failed task-notification", () => {
      const parseTaskNotification = (provider as any).parseTaskNotification.bind(provider);

      const content = `<task-notification>
<task-id>def456</task-id>
<status>failed</status>
</task-notification>`;

      const result = parseTaskNotification(content);
      expect(result).toEqual({ taskId: "def456", status: "failed" });
    });

    it("should parse error task-notification", () => {
      const parseTaskNotification = (provider as any).parseTaskNotification.bind(provider);

      const content = `<task-notification>
<task-id>ghi789</task-id>
<status>error</status>
</task-notification>`;

      const result = parseTaskNotification(content);
      expect(result).toEqual({ taskId: "ghi789", status: "error" });
    });

    it("should return null for non-notification content", () => {
      const parseTaskNotification = (provider as any).parseTaskNotification.bind(provider);

      expect(parseTaskNotification("random text without notification")).toBeNull();
      expect(parseTaskNotification("")).toBeNull();
      expect(parseTaskNotification("<task-id>abc</task-id>")).toBeNull(); // Missing wrapper
    });

    it("should return null for incomplete notification", () => {
      const parseTaskNotification = (provider as any).parseTaskNotification.bind(provider);

      // Missing status
      const missingStatus = `<task-notification>
<task-id>abc123</task-id>
</task-notification>`;
      expect(parseTaskNotification(missingStatus)).toBeNull();

      // Missing task-id
      const missingTaskId = `<task-notification>
<status>completed</status>
</task-notification>`;
      expect(parseTaskNotification(missingTaskId)).toBeNull();
    });

    it("should handle array content with text blocks", () => {
      const parseTaskNotification = (provider as any).parseTaskNotification.bind(provider);

      const arrayContent = [
        { type: "text", text: "Some prefix text " },
        { type: "text", text: "<task-notification><task-id>xyz999</task-id><status>completed</status></task-notification>" },
      ];

      const result = parseTaskNotification(arrayContent);
      expect(result).toEqual({ taskId: "xyz999", status: "completed" });
    });

    it("should trim whitespace from taskId and status", () => {
      const parseTaskNotification = (provider as any).parseTaskNotification.bind(provider);

      const content = `<task-notification>
<task-id>  whitespace-id  </task-id>
<status>  completed  </status>
</task-notification>`;

      const result = parseTaskNotification(content);
      expect(result).toEqual({ taskId: "whitespace-id", status: "completed" });
    });
  });

  describe("parseTaskOutputResult", () => {
    it("should parse task output with completed status", () => {
      const parseTaskOutputResult = (provider as any).parseTaskOutputResult.bind(provider);

      const content = "<task_id>abc123</task_id><status>completed</status>";
      const result = parseTaskOutputResult(content);
      expect(result).toEqual({ taskId: "abc123", status: "completed" });
    });

    it("should parse task output with failed status", () => {
      const parseTaskOutputResult = (provider as any).parseTaskOutputResult.bind(provider);

      const content = "<task_id>abc123</task_id><status>failed</status>";
      const result = parseTaskOutputResult(content);
      expect(result).toEqual({ taskId: "abc123", status: "failed" });
    });

    it("should parse task output with error status", () => {
      const parseTaskOutputResult = (provider as any).parseTaskOutputResult.bind(provider);

      const content = "<task_id>abc123</task_id><status>error</status>";
      const result = parseTaskOutputResult(content);
      expect(result).toEqual({ taskId: "abc123", status: "error" });
    });
  });

  describe("isTerminalStatus", () => {
    it("should identify terminal statuses", () => {
      const isTerminalStatus = (provider as any).isTerminalStatus.bind(provider);

      expect(isTerminalStatus("completed")).toBe(true);
      expect(isTerminalStatus("failed")).toBe(true);
      expect(isTerminalStatus("error")).toBe(true);
      expect(isTerminalStatus("cancelled")).toBe(true);
    });

    it("should be case-insensitive", () => {
      const isTerminalStatus = (provider as any).isTerminalStatus.bind(provider);

      expect(isTerminalStatus("COMPLETED")).toBe(true);
      expect(isTerminalStatus("Failed")).toBe(true);
      expect(isTerminalStatus("ERROR")).toBe(true);
    });

    it("should return false for non-terminal statuses", () => {
      const isTerminalStatus = (provider as any).isTerminalStatus.bind(provider);

      expect(isTerminalStatus("running")).toBe(false);
      expect(isTerminalStatus("pending")).toBe(false);
      expect(isTerminalStatus("started")).toBe(false);
      expect(isTerminalStatus("unknown")).toBe(false);
    });
  });
});
