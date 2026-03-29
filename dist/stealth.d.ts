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
import { Page, BrowserContext } from "playwright";
/** Sleep for a human-like duration. Never exact, always jittered. */
export declare function humanDelay(baseMs: number, variance?: number): Promise<void>;
/** Random integer in [min, max]. */
export declare function randInt(min: number, max: number): number;
export declare function randomProfile(): {
    userAgent: string;
    viewport: {
        width: number;
        height: number;
    };
};
/**
 * Inject stealth patches into a page BEFORE any site JS runs.
 * Must be called via context.addInitScript() or page.addInitScript().
 */
export declare const STEALTH_INIT_SCRIPT = "\n  // 1. Hide webdriver flag\n  Object.defineProperty(navigator, 'webdriver', { get: () => false });\n\n  // 2. Fake plugins array (real Chrome has at least 3)\n  Object.defineProperty(navigator, 'plugins', {\n    get: () => {\n      const arr = [\n        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },\n        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },\n        { name: 'Native Client', filename: 'internal-nacl-plugin' },\n      ];\n      arr.length = 3;\n      return arr;\n    },\n  });\n\n  // 3. Fake languages (matches typical Chrome)\n  Object.defineProperty(navigator, 'languages', {\n    get: () => ['en-US', 'en'],\n  });\n\n  // 4. Remove Playwright/automation artifacts\n  delete window.__playwright;\n  delete window.__pw_manual;\n\n  // 5. Chrome runtime stub (headless Chrome lacks this)\n  if (!window.chrome) {\n    window.chrome = { runtime: {} };\n  }\n\n  // 6. Permissions query \u2014 real Chrome returns 'prompt' for notifications\n  const originalQuery = window.navigator.permissions?.query;\n  if (originalQuery) {\n    window.navigator.permissions.query = (parameters) => {\n      if (parameters.name === 'notifications') {\n        return Promise.resolve({ state: Notification.permission });\n      }\n      return originalQuery(parameters);\n    };\n  }\n\n  // 7. WebGL vendor/renderer (avoid \"Google SwiftShader\" which screams headless)\n  const getParameter = WebGLRenderingContext.prototype.getParameter;\n  WebGLRenderingContext.prototype.getParameter = function(parameter) {\n    if (parameter === 37445) return 'Intel Inc.';\n    if (parameter === 37446) return 'Intel Iris OpenGL Engine';\n    return getParameter.call(this, parameter);\n  };\n";
/**
 * Type text with human-like timing — variable inter-key delays,
 * occasional pauses, rare typo+backspace.
 */
export declare function humanType(page: Page, selector: string, text: string): Promise<void>;
/**
 * Move mouse to element with a natural-looking curve before clicking.
 * Prevents "teleporting cursor" detection.
 */
export declare function humanClick(page: Page, selector: string): Promise<void>;
export declare function saveCookies(context: BrowserContext): Promise<void>;
export declare function loadCookies(context: BrowserContext): Promise<boolean>;
export declare function clearCookies(): void;
/**
 * Wait for page to settle, but with human-like variance.
 * Don't use networkidle exclusively — it creates a detectable pattern.
 */
export declare function humanWaitForLoad(page: Page): Promise<void>;
/**
 * Calculate next poll interval with jitter.
 * Base interval + gaussian noise so polling isn't clockwork.
 */
export declare function nextPollInterval(baseMs: number): number;
//# sourceMappingURL=stealth.d.ts.map