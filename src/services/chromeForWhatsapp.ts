import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

/**
 * The Chrome that whatsapp-web.js should launch on a server (Render, Linux).
 *
 * Uses the Puppeteer that whatsapp-web.js itself depends on (CommonJS, Node 18+), loaded
 * relative to whatsapp-web.js so it resolves however npm laid out node_modules. Its Chrome is
 * normally downloaded by `npm install` into .cache/puppeteer (see .puppeteerrc.cjs); if that
 * step was skipped, downloadChrome() fetches the same version at runtime.
 */

// Same folder as .puppeteerrc.cjs
export const BROWSER_CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'puppeteer');

function puppeteerRequire() {
  const wwebRequire = createRequire(require.resolve('whatsapp-web.js'));
  return createRequire(wwebRequire.resolve('puppeteer'));
}

/** Path of the Chrome that whatsapp-web.js's Puppeteer expects, if it is on disk. */
export function findChrome(): string | null {
  const puppeteer = puppeteerRequire()('puppeteer');
  const expected: string = puppeteer.executablePath();
  return expected && fs.existsSync(expected) ? expected : null;
}

/** Chrome's major version (e.g. 146) for the browser at this path, or null if it can't be told. */
export function chromeMajorVersion(executablePath: string): number | null {
  // Downloaded Chrome lives in a folder named after its version (…/linux-146.0.7680.31/…)
  const fromPath = executablePath.match(/[-\\/](\d{2,3})\.\d+\.\d+\.\d+[\\/]/);
  if (fromPath) return Number(fromPath[1]);
  // Installed Chrome on Windows keeps a version-named folder next to chrome.exe
  try {
    const versions = fs
      .readdirSync(path.dirname(executablePath))
      .map((name) => name.match(/^(\d+)\.\d+\.\d+\.\d+$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => Number(m[1]));
    if (versions.length) return Math.max(...versions);
  } catch {
    // folder not readable: try asking Chrome below
  }
  if (process.platform !== 'win32') {
    try {
      const out = execFileSync(executablePath, ['--version'], { timeout: 15000 }).toString();
      const m = out.match(/(\d{2,3})\.\d+\.\d+/);
      if (m) return Number(m[1]);
    } catch {
      // unknown version
    }
  }
  return null;
}

/**
 * A normal desktop Chrome user agent for this browser. Headless Chrome on Linux calls itself
 * "HeadlessChrome", and WhatsApp answers that with "update Chrome" instead of the QR code.
 */
export function desktopUserAgent(executablePath: string): string | null {
  const major = chromeMajorVersion(executablePath);
  if (!major) return null;
  const os =
    process.platform === 'win32'
      ? 'Windows NT 10.0; Win64; x64'
      : process.platform === 'darwin'
        ? 'Macintosh; Intel Mac OS X 10_15_7'
        : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

/** Force-stops a Chrome and its child processes (Puppeteer starts Chrome in its own process group). */
export function killProcessTree(pid: number) {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const procEntries = (): string[] => {
  try {
    return fs.readdirSync('/proc').filter((name) => /^\d+$/.test(name));
  } catch {
    return [];
  }
};

const readProc = (pid: string, file: string) => {
  try {
    return fs.readFileSync(`/proc/${pid}/${file}`, 'utf8');
  } catch {
    return '';
  }
};

/**
 * Linux: force-stops any Chrome still using this profile folder, left over from an earlier
 * attempt that hung. Returns how many were stopped. (A frozen Chrome holds memory and the
 * profile lock, which makes every later attempt slower until the server is restarted.)
 */
export function killChromeUsingProfile(profileDir: string): number {
  let killed = 0;
  for (const pid of procEntries()) {
    if (Number(pid) === process.pid) continue;
    const cmdline = readProc(pid, 'cmdline').split('\0');
    if (!cmdline.some((arg) => arg === `--user-data-dir=${profileDir}`)) continue;
    killProcessTree(Number(pid));
    killed++;
  }
  return killed;
}

const readNumber = (file: string): number | null => {
  try {
    const text = fs.readFileSync(file, 'utf8').trim();
    return /^\d+$/.test(text) ? Number(text) : null;
  } catch {
    return null;
  }
};

/** Memory use against the server's real limit (container limit on Render), and how many Chrome processes run. */
export function serverResources() {
  // cgroup v2, then v1; a v1 "no limit" is a huge number
  const used = readNumber('/sys/fs/cgroup/memory.current') ?? readNumber('/sys/fs/cgroup/memory/memory.usage_in_bytes');
  let limit = readNumber('/sys/fs/cgroup/memory.max') ?? readNumber('/sys/fs/cgroup/memory/memory.limit_in_bytes');
  if (limit && limit > 64 * 1024 ** 4) limit = null;
  const mb = (bytes: number) => Math.round(bytes / 1024 ** 2);
  // Running Chrome processes only: closed ones can linger as zombies (no memory) when the
  // container's first process doesn't clean them up
  const isZombie = (pid: string) => / Z /.test(readProc(pid, 'stat').replace(/^.*\)/, ''));
  const chromeProcesses = procEntries().filter((pid) => readProc(pid, 'comm').trim().startsWith('chrome') && !isZombie(pid)).length;
  return {
    memory_used_mb: used != null ? mb(used) : mb(os.totalmem() - os.freemem()),
    memory_limit_mb: limit != null ? mb(limit) : mb(os.totalmem()),
    chrome_processes: process.platform === 'linux' ? chromeProcesses : null,
  };
}

/** Downloads that Chrome into .cache/puppeteer and returns its path. */
export async function downloadChrome(): Promise<string> {
  const req = puppeteerRequire();
  const { PUPPETEER_REVISIONS } = req('puppeteer-core/internal/revisions.js');
  const { install, Browser } = req('@puppeteer/browsers');
  const installed = await install({ browser: Browser.CHROME, buildId: PUPPETEER_REVISIONS.chrome, cacheDir: BROWSER_CACHE_DIR });
  return installed.executablePath;
}
