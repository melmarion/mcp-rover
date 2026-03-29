"use strict";
/**
 * Stealth utilities — make Playwright look like a real human on a real browser.
 * Mirrors the anti-detection layer used for LinkedIn (PerimeterX-grade).
 *
 * Covers:
 *   1. Browser fingerprint masking (webdriver, plugins, languages)
 *   2. Human-like timing (gaussian delays, typing variance, mouse movement)
 *   3. Session persistence (cookies saved/restored across runs)
 *   4. Viewport + UA rotation within realistic ranges
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STEALTH_INIT_SCRIPT = void 0;
exports.humanDelay = humanDelay;
exports.randInt = randInt;
exports.randomProfile = randomProfile;
exports.humanType = humanType;
exports.humanClick = humanClick;
exports.saveCookies = saveCookies;
exports.loadCookies = loadCookies;
exports.clearCookies = clearCookies;
exports.humanWaitForLoad = humanWaitForLoad;
exports.nextPollInterval = nextPollInterval;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// ── Randomization helpers ────────────────────────────────────────────────────
/** Gaussian-distributed random number (Box-Muller). */
function gaussianRandom(mean, stddev) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, mean + z * stddev);
}
/** Sleep for a human-like duration. Never exact, always jittered. */
function humanDelay(baseMs, variance = 0.3) {
    const ms = gaussianRandom(baseMs, baseMs * variance);
    return new Promise((resolve) => setTimeout(resolve, Math.round(ms)));
}
/** Random integer in [min, max]. */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
/** Pick a random element from an array. */
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
// ── Realistic browser profiles ───────────────────────────────────────────────
const CHROME_VERSIONS = [
    "131.0.6778.108",
    "131.0.6778.86",
    "130.0.6723.117",
    "130.0.6723.92",
    "132.0.6834.57",
];
const VIEWPORTS = [
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
    { width: 1680, height: 1050 },
];
function randomProfile() {
    const chromeVersion = pick(CHROME_VERSIONS);
    const viewport = pick(VIEWPORTS);
    const ua = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ` +
        `(KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    return { userAgent: ua, viewport };
}
// ── Fingerprint masking ──────────────────────────────────────────────────────
/**
 * Inject stealth patches into a page BEFORE any site JS runs.
 * Must be called via context.addInitScript() or page.addInitScript().
 */
exports.STEALTH_INIT_SCRIPT = `
  // 1. Hide webdriver flag
  Object.defineProperty(navigator, 'webdriver', { get: () => false });

  // 2. Fake plugins array (real Chrome has at least 3)
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const arr = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ];
      arr.length = 3;
      return arr;
    },
  });

  // 3. Fake languages (matches typical Chrome)
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
  });

  // 4. Remove Playwright/automation artifacts
  delete window.__playwright;
  delete window.__pw_manual;

  // 5. Chrome runtime stub (headless Chrome lacks this)
  if (!window.chrome) {
    window.chrome = { runtime: {} };
  }

  // 6. Permissions query — real Chrome returns 'prompt' for notifications
  const originalQuery = window.navigator.permissions?.query;
  if (originalQuery) {
    window.navigator.permissions.query = (parameters) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission });
      }
      return originalQuery(parameters);
    };
  }

  // 7. WebGL vendor/renderer (avoid "Google SwiftShader" which screams headless)
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) return 'Intel Inc.';
    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
    return getParameter.call(this, parameter);
  };
`;
// ── Human-like typing ────────────────────────────────────────────────────────
/**
 * Type text with human-like timing — variable inter-key delays,
 * occasional pauses, rare typo+backspace.
 */
async function humanType(page, selector, text) {
    await page.click(selector);
    await humanDelay(200, 0.5);
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        // Occasional longer pause (thinking)
        if (Math.random() < 0.05 && i > 0) {
            await humanDelay(800, 0.6);
        }
        await page.keyboard.type(char, { delay: 0 });
        // Inter-key delay: faster for common sequences, slower for shifts
        const isSpace = char === " ";
        const baseDelay = isSpace ? randInt(80, 160) : randInt(40, 120);
        await new Promise((r) => setTimeout(r, baseDelay));
    }
}
// ── Mouse movement ───────────────────────────────────────────────────────────
/**
 * Move mouse to element with a natural-looking curve before clicking.
 * Prevents "teleporting cursor" detection.
 */
async function humanClick(page, selector) {
    const element = await page.waitForSelector(selector, { timeout: 10000 });
    if (!element)
        throw new Error(`Element not found: ${selector}`);
    const box = await element.boundingBox();
    if (!box)
        throw new Error(`Element has no bounding box: ${selector}`);
    // Target a random point within the element (not dead center)
    const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
    const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);
    // Move with steps (simulates real mouse trajectory)
    await page.mouse.move(targetX, targetY, { steps: randInt(8, 20) });
    await humanDelay(100, 0.4);
    await page.mouse.click(targetX, targetY);
}
// ── Cookie persistence ───────────────────────────────────────────────────────
const COOKIE_DIR = path_1.default.join(process.env.HOME || process.env.USERPROFILE || ".", ".rover-session");
const COOKIE_FILE = path_1.default.join(COOKIE_DIR, "cookies.json");
async function saveCookies(context) {
    if (!fs_1.default.existsSync(COOKIE_DIR)) {
        fs_1.default.mkdirSync(COOKIE_DIR, { recursive: true });
    }
    const cookies = await context.cookies();
    fs_1.default.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
}
async function loadCookies(context) {
    if (!fs_1.default.existsSync(COOKIE_FILE))
        return false;
    try {
        const raw = fs_1.default.readFileSync(COOKIE_FILE, "utf-8");
        const cookies = JSON.parse(raw);
        await context.addCookies(cookies);
        return true;
    }
    catch {
        return false;
    }
}
function clearCookies() {
    if (fs_1.default.existsSync(COOKIE_FILE))
        fs_1.default.unlinkSync(COOKIE_FILE);
}
// ── Page waiting (human-like) ────────────────────────────────────────────────
/**
 * Wait for page to settle, but with human-like variance.
 * Don't use networkidle exclusively — it creates a detectable pattern.
 */
async function humanWaitForLoad(page) {
    // Wait for DOM content, not networkidle (more natural)
    await page.waitForLoadState("domcontentloaded");
    // Simulate human "reading the page" delay before acting
    await humanDelay(randInt(800, 2000), 0.3);
}
// ── Polling jitter ───────────────────────────────────────────────────────────
/**
 * Calculate next poll interval with jitter.
 * Base interval + gaussian noise so polling isn't clockwork.
 */
function nextPollInterval(baseMs) {
    // +/- 30% jitter, minimum 60% of base
    return Math.max(baseMs * 0.6, Math.round(gaussianRandom(baseMs, baseMs * 0.3)));
}
//# sourceMappingURL=stealth.js.map