import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

// Advance-width-to-em ratios for common monospace fonts.
// Derived from each font's OS/2 xAvgCharWidth / unitsPerEm.
const FONT_RATIOS: Record<string, number> = {
	"jetbrainsmono nerd font": 0.6021,
	"jetbrains mono": 0.6021,
	"jetbrainsmono nf": 0.6021,
	"cascadia mono": 0.5859,
	"cascadia code": 0.5859,
	"cascadia mono nf": 0.5859,
	"cascadia code nf": 0.5859,
	"consolas": 0.5498,
	"courier new": 0.6001,
	"fira code": 0.6000,
	"fira mono": 0.6000,
	"source code pro": 0.6000,
	"hack": 0.6000,
	"menlo": 0.6000,
	"sf mono": 0.6000,
	"ubuntu mono": 0.5000,
	"inconsolata": 0.5000,
	"roboto mono": 0.6000,
	"iosevka": 0.5000,
};

interface WTFontInfo {
	face: string;
	size: number;
}

function readWTFont(): WTFontInfo {
	const defaults: WTFontInfo = { face: "Cascadia Mono", size: 12 };

	const locations = [
		join(homedir(), "AppData", "Local", "Packages", "Microsoft.WindowsTerminal_8wekyb3d8bbwe", "LocalState", "settings.json"),
		join(homedir(), "AppData", "Local", "Packages", "Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe", "LocalState", "settings.json"),
		join(homedir(), "AppData", "Local", "Microsoft", "Windows Terminal", "settings.json"),
	];

	for (const loc of locations) {
		if (!existsSync(loc)) continue;
		try {
			const content = readFileSync(loc, "utf-8");
			const sizeMatch = content.match(/"size"\s*:\s*(\d+(?:\.\d+)?)/);
			const faceMatch = content.match(/"face"\s*:\s*"([^"]+)"/);
			return {
				face: faceMatch?.[1] ?? defaults.face,
				size: sizeMatch ? parseFloat(sizeMatch[1]!) : defaults.size,
			};
		} catch {
			continue;
		}
	}

	return defaults;
}

function findWindowsTerminalPid(): number | null {
	try {
		const output = execSync("wmic process get ProcessId,ParentProcessId,Name /format:csv", {
			encoding: "utf8",
			windowsHide: true,
			stdio: ["pipe", "pipe", "ignore"],
		});
		const map = new Map<number, number>();
		const names = new Map<number, string>();
		for (const line of output.split("\n")) {
			const parts = line.trim().split(",");
			if (parts.length < 4) continue;
			const name = parts[1]!;
			const ppid = parseInt(parts[2]!, 10);
			const pid = parseInt(parts[3]!, 10);
			if (!isNaN(pid) && !isNaN(ppid)) {
				map.set(pid, ppid);
				names.set(pid, name.toLowerCase());
			}
		}
		let current = process.pid;
		for (let i = 0; i < 20; i++) {
			const parent = map.get(current);
			if (!parent || parent === current || parent === 0) break;
			const name = names.get(parent) ?? "";
			if (name === "windowsterminal.exe") return parent;
			current = parent;
		}
	} catch {
	}
	return null;
}

let _cachedWidth: number | null = null;
let _cacheTime = 0;
const CACHE_TTL = 10_000;

export async function getWindowsTerminalColumns(): Promise<number | null> {
	const now = Date.now();
	if (_cachedWidth !== null && now - _cacheTime < CACHE_TTL) {
		return _cachedWidth;
	}

	try {
		const result = await computeColumnsViaWin32();
		if (result !== null && result > 0) {
			_cachedWidth = result;
			_cacheTime = now;
			return result;
		}
	} catch {
	}

	return null;
}

async function computeColumnsViaWin32(): Promise<number | null> {
	let koffi: any;
	try {
		const mod = await import("koffi");
		koffi = mod.default ?? mod;
	} catch {
		return null;
	}

	if (typeof koffi.load !== "function") return null;

	const user32 = koffi.load("user32.dll");

	const HWND = koffi.pointer("HWND", koffi.opaque());
	const RECT = koffi.struct("RECT", {
		left: "int32",
		top: "int32",
		right: "int32",
		bottom: "int32",
	});

	const EnumWindowsCallback = koffi.proto("bool __stdcall EnumWindowsCallback(HWND hwnd, intptr lParam)");
	const EnumWindows = user32.func("bool __stdcall EnumWindows(EnumWindowsCallback *cb, intptr lParam)");
	const IsWindowVisible = user32.func("bool __stdcall IsWindowVisible(HWND hwnd)");
	const GetClientRect = user32.func("bool __stdcall GetClientRect(HWND hwnd, _Out_ RECT *rect)");
	const GetDpiForWindow = user32.func("uint32_t __stdcall GetDpiForWindow(HWND hwnd)");
	const GetWindowThreadProcessId = user32.func("uint32_t __stdcall GetWindowThreadProcessId(HWND hwnd, _Out_ uint32_t *pid)");

	const wtPid = findWindowsTerminalPid();
	if (wtPid === null) return null;

	let bestHwnd: unknown = null;
	let bestWidth = 0;
	let bestDpi = 96;

	EnumWindows((hwnd: unknown) => {
		if (!IsWindowVisible(hwnd)) return true;

		const pidOut = [0];
		GetWindowThreadProcessId(hwnd, pidOut);
		if (pidOut[0] !== wtPid) return true;

		const rect = { left: 0, top: 0, right: 0, bottom: 0 };
		GetClientRect(hwnd, rect);
		const width = rect.right - rect.left;

		if (width > bestWidth) {
			bestHwnd = hwnd;
			bestWidth = width;
			bestDpi = GetDpiForWindow(hwnd);
		}

		return true;
	}, 0);

	if (!bestHwnd || bestWidth <= 0) return null;

	const scale = bestDpi / 96;
	const font = readWTFont();
	const ratio = FONT_RATIOS[font.face.toLowerCase()] ?? 0.6;
	const cellWidthPhysical = (font.size * bestDpi) / 72 * ratio;
	const cellWidthScaled = cellWidthPhysical / scale;

	if (cellWidthScaled <= 0) return null;

	const cols = Math.floor(bestWidth / cellWidthScaled);
	return cols > 0 ? cols : null;
}
