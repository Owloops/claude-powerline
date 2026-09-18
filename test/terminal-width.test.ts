import { ttyNameFromDevNumber } from "../src/utils/terminal-width";

// Device numbers are encoded the way the kernel's new_encode_dev() does it:
// (minor & 0xff) | (major << 8) | ((minor & ~0xff) << 12)
const encodeDev = (major: number, minor: number) =>
  (minor & 0xff) | (major << 8) | ((minor & ~0xff) << 12);

describe("ttyNameFromDevNumber", () => {
  it("should return null when the process has no controlling terminal", () => {
    expect(ttyNameFromDevNumber(0)).toBeNull();
  });

  it("should name UNIX98 pty slaves on the base major", () => {
    expect(ttyNameFromDevNumber(encodeDev(136, 0))).toBe("pts/0");
    expect(ttyNameFromDevNumber(encodeDev(136, 3))).toBe("pts/3");
    expect(ttyNameFromDevNumber(encodeDev(136, 255))).toBe("pts/255");
  });

  it("should carry the pty major into the slave number", () => {
    expect(ttyNameFromDevNumber(encodeDev(137, 0))).toBe("pts/256");
    expect(ttyNameFromDevNumber(encodeDev(143, 255))).toBe("pts/2047");
  });

  it("should name virtual consoles", () => {
    expect(ttyNameFromDevNumber(encodeDev(4, 1))).toBe("tty1");
    expect(ttyNameFromDevNumber(encodeDev(4, 63))).toBe("tty63");
  });

  it("should name serial lines above the console range", () => {
    expect(ttyNameFromDevNumber(encodeDev(4, 64))).toBe("ttyS0");
    expect(ttyNameFromDevNumber(encodeDev(4, 70))).toBe("ttyS6");
  });

  it("should decode minors that do not fit in the low byte", () => {
    expect(ttyNameFromDevNumber(encodeDev(4, 300))).toBe("ttyS236");
  });

  it("should return null for devices it cannot name", () => {
    expect(ttyNameFromDevNumber(encodeDev(5, 0))).toBeNull();
    expect(ttyNameFromDevNumber(encodeDev(3, 0))).toBeNull();
    expect(ttyNameFromDevNumber(encodeDev(144, 0))).toBeNull();
  });
});
