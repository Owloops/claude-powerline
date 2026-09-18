import { execSync } from "node:child_process";
import { openSync, readFileSync } from "node:fs";
import { WriteStream } from "node:tty";
import {
  clearTerminalWidthCache,
  getRawTerminalWidth,
} from "../src/utils/terminal-width";

jest.mock("node:fs", () => ({
  readFileSync: jest.fn(),
  openSync: jest.fn(),
  closeSync: jest.fn(),
}));

jest.mock("node:child_process", () => ({ execSync: jest.fn() }));

jest.mock("node:tty", () => ({ WriteStream: jest.fn() }));

const execSyncMock = execSync as jest.MockedFunction<typeof execSync>;
const readFileSyncMock = readFileSync as jest.MockedFunction<
  typeof readFileSync
>;
const openSyncMock = openSync as jest.MockedFunction<typeof openSync>;
const writeStreamMock = WriteStream as unknown as jest.Mock;

const mockTty = (columns: number) => ({ columns, destroy: jest.fn() });

const realPlatform = process.platform;

// The lookup branches on platform and the /proc reader is Linux-only, so pin it:
// on darwin the same execSync mock answers the `ps` ancestor walk instead and
// every call count below changes.
beforeAll(() => {
  Object.defineProperty(process, "platform", { value: "linux" });
});

afterAll(() => {
  Object.defineProperty(process, "platform", { value: realPlatform });
});

beforeEach(() => {
  clearTerminalWidthCache();

  // mockReset, not mockClear: it drains any `...Once` queue a test left
  // behind, which mockClear keeps and the re-install below does not overwrite.
  readFileSyncMock.mockReset();
  openSyncMock.mockReset();
  execSyncMock.mockReset();
  writeStreamMock.mockReset();

  readFileSyncMock.mockImplementation(() => {
    throw new Error("no /proc in this test");
  });
  openSyncMock.mockImplementation(() => {
    throw new Error("no tty in this test");
  });
  execSyncMock.mockImplementation(() => "120\n");
});

describe("terminal width caching", () => {
  // No controlling terminal is discoverable under these mocks, so the lookup
  // falls through to `tput cols` and every attempt is one execSync call.
  it("should resolve the width once and reuse it", () => {
    expect(getRawTerminalWidth()).toBe(120);
    expect(getRawTerminalWidth()).toBe(120);

    // The tui style asks twice per render; the second ask must not re-spawn.
    expect(execSyncMock).toHaveBeenCalledTimes(1);
  });

  it("should resolve again after the cache is cleared", () => {
    getRawTerminalWidth();
    clearTerminalWidthCache();
    getRawTerminalWidth();

    expect(execSyncMock).toHaveBeenCalledTimes(2);
  });

  it("should cache a failed lookup rather than retrying it", () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("tput missing");
    });

    expect(getRawTerminalWidth()).toBeNull();
    expect(getRawTerminalWidth()).toBeNull();
    expect(execSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe("resolving the width from /proc", () => {
  // pts/4 is major 136, minor 4, which new_encode_dev packs as 136 << 8 | 4.
  const PTS_4 = 136 * 256 + 4;

  // comm carries both a space and a ')', the case only `lastIndexOf(")")`
  // survives. After it the fields are state, ppid, pgrp, session, tty_nr.
  const statLine = (ttyNr: number) =>
    `4242 (foo) bar) S 1 1 1 ${ttyNr} 0 0 0 0 0 0 0`;

  it("reads the width off the device named in tty_nr", () => {
    const tty = mockTty(137);
    readFileSyncMock.mockReturnValue(statLine(PTS_4));
    openSyncMock.mockReturnValue(7);
    writeStreamMock.mockImplementation(() => tty);

    expect(getRawTerminalWidth()).toBe(137);
    expect(openSyncMock).toHaveBeenCalledWith("/dev/pts/4", "r");
    // The stream opens descriptors beyond the fd handed in, so closing the fd
    // alone leaks them.
    expect(tty.destroy).toHaveBeenCalled();
    // The device answered, so nothing should have been spawned.
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("does not spawn ps when there is no controlling terminal", () => {
    readFileSyncMock.mockReturnValue(statLine(0));

    expect(getRawTerminalWidth()).toBe(120);
    // Only the `tput cols` fallback; no ancestor walk via ps.
    expect(execSyncMock).toHaveBeenCalledTimes(1);
  });

  it("asks ps about the pid holding the terminal, not the whole chain", () => {
    const self = process.pid.toString();
    // This process has no controlling terminal; its parent has one, on a major
    // the decoder cannot name. Only the parent is worth asking ps about.
    readFileSyncMock.mockImplementation((path) =>
      String(path) === `/proc/${self}/stat`
        ? `${self} (node) S 555 1 1 0 0 0 0 0 0 0 0`
        : statLine(188 * 256 + 1),
    );
    execSyncMock.mockImplementation(() => "1 pts/9\n");
    openSyncMock.mockReturnValue(7);
    writeStreamMock.mockImplementation(() => mockTty(91));

    expect(getRawTerminalWidth()).toBe(91);
    // Each ps runs through a shell and scans all of /proc, which is the cost
    // the /proc reader exists to avoid; the chain is already known by now.
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(String(execSyncMock.mock.calls[0]?.[0])).toContain("-p 555");
  });
});

describe("resolving the width off Linux", () => {
  // /proc is Linux-only, so every other Unix walks ancestors with ps.
  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "darwin" });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: "linux" });
  });

  it("walks ancestors with ps and never reads /proc", () => {
    // The statusline process itself usually has no controlling terminal — ps
    // prints `??` — so the tty is only found by climbing to an ancestor.
    execSyncMock
      .mockImplementationOnce(() => "555 ??\n")
      .mockImplementationOnce(() => "1 pts/3\n");
    openSyncMock.mockReturnValue(7);
    writeStreamMock.mockImplementation(() => mockTty(64));

    expect(getRawTerminalWidth()).toBe(64);
    expect(openSyncMock).toHaveBeenCalledWith("/dev/pts/3", "r");
    expect(execSyncMock).toHaveBeenCalledTimes(2);
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });
});

describe("resolving the width on Windows", () => {
  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "win32" });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: "linux" });
  });

  it("reads the width from mode con", () => {
    execSyncMock.mockImplementation(() => "Lines: 40\nColumns: 150\n");

    expect(getRawTerminalWidth()).toBe(150);
  });

  // A detached console reports no Columns line, and the unix lookup is the
  // last resort left; hoisting the memo dropped this fallthrough once already.
  it("falls through to the unix lookup when mode con reports no width", () => {
    execSyncMock.mockImplementation((command) =>
      String(command).includes("mode con") ? "Lines: 40\n" : "120\n",
    );

    expect(getRawTerminalWidth()).toBe(120);
  });
});
