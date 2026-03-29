import { Browser, BrowserContext, Page, chromium } from "playwright";
import {
  STEALTH_INIT_SCRIPT,
  randomProfile,
  humanDelay,
  humanType,
  humanClick,
  humanWaitForLoad,
  saveCookies,
  loadCookies,
  nextPollInterval,
  randInt,
} from "./stealth.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RoverSession {
  isLoggedIn: boolean;
  userId?: string;
  email?: string;
  isSitter: boolean;
}

export interface InboxThread {
  threadId: string;
  ownerName: string;
  petName?: string;
  lastMessage: string;
  lastMessageTime: string;
  isUnread: boolean;
  serviceType?: string;
  dates?: string;
  threadUrl: string;
}

export interface ThreadMessage {
  sender: string;
  text: string;
  timestamp: string;
  isOwner: boolean;
}

export interface InboxPollResult {
  newThreads: InboxThread[];
  updatedThreads: InboxThread[];
  timestamp: string;
}

export interface SitterStats {
  responseRate?: string;
  responseTime?: string;
  bookingRate?: string;
  repeatScore?: string;
  reviewAverage?: string;
  reviewCount?: number;
  isStarSitter?: boolean;
}

// ── Sitter-side browser with full stealth ────────────────────────────────────

export class RoverBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private session: RoverSession = { isLoggedIn: false, isSitter: false };
  private readonly BASE_URL = "https://www.rover.com";
  private knownThreadIds: Set<string> = new Set();
  private lastPollTime: string | null = null;

  /**
   * Launch browser with stealth configuration.
   * Mirrors LinkedIn anti-detection: real fingerprint, no webdriver leak,
   * cookie persistence, randomized viewport.
   */
  async initialize(headless: boolean = true): Promise<void> {
    const profile = randomProfile();

    this.browser = await chromium.launch({
      headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--window-size=1440,900",
      ],
    });

    this.context = await this.browser.newContext({
      userAgent: profile.userAgent,
      viewport: profile.viewport,
      locale: "en-US",
      timezoneId: "America/Los_Angeles",
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
      permissions: ["geolocation"],
      screen: {
        width: profile.viewport.width,
        height: profile.viewport.height,
      },
    });

    // Inject stealth patches before any page loads
    await this.context.addInitScript(STEALTH_INIT_SCRIPT);

    this.page = await this.context.newPage();

    // Try to restore saved session
    const restored = await loadCookies(this.context);
    if (restored) {
      await this.page.goto(`${this.BASE_URL}/account/`, {
        waitUntil: "domcontentloaded",
      });
      await humanDelay(1500);

      const url = this.page.url();
      if (!url.includes("/login") && !url.includes("/signin")) {
        this.session = { isLoggedIn: true, isSitter: true };
      }
    }
  }

  async close(): Promise<void> {
    if (this.context && this.session.isLoggedIn) {
      await saveCookies(this.context);
    }
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  private ensurePage(): Page {
    if (!this.page) throw new Error("Browser not initialized. Call initialize() first.");
    return this.page;
  }

  private ensureLoggedIn(): void {
    if (!this.session.isLoggedIn) {
      throw new Error("You must be logged in. Call login() first.");
    }
  }

  // ── Authentication ───────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<RoverSession> {
    const page = this.ensurePage();

    await page.goto(`${this.BASE_URL}/login/`, {
      waitUntil: "domcontentloaded",
    });
    await humanDelay(2000, 0.4);
    await humanDelay(randInt(500, 1500));

    const emailSelector = 'input[name="email"], input[type="email"]';
    await page.waitForSelector(emailSelector, { timeout: 10000 });
    await humanType(page, emailSelector, email);

    await humanDelay(randInt(300, 800));

    const passSelector = 'input[name="password"], input[type="password"]';
    await humanType(page, passSelector, password);

    await humanDelay(randInt(400, 1000));

    const submitSelector = 'button[type="submit"], input[type="submit"]';
    await humanClick(page, submitSelector);

    await page.waitForLoadState("domcontentloaded");
    await humanDelay(3000, 0.3);

    const url = page.url();
    const loggedIn = !url.includes("/login") && !url.includes("/signin");

    if (loggedIn && this.context) {
      await saveCookies(this.context);
    }

    this.session = {
      isLoggedIn: loggedIn,
      email: loggedIn ? email : undefined,
      isSitter: loggedIn,
    };

    return this.session;
  }

  // ── Inbox monitoring (sitter side) ───────────────────────────────────────

  async getInboxThreads(): Promise<InboxThread[]> {
    this.ensureLoggedIn();
    const page = this.ensurePage();

    await page.goto(`${this.BASE_URL}/dashboard/messages/`, {
      waitUntil: "domcontentloaded",
    });
    await humanWaitForLoad(page);
    await this.humanScroll(page, randInt(2, 4));

    const threads = await page.evaluate(() => {
      const items: Array<{
        threadId: string;
        ownerName: string;
        lastMessage: string;
        lastMessageTime: string;
        isUnread: boolean;
        threadUrl: string;
      }> = [];

      const threadEls = document.querySelectorAll(
        '[class*="conversation"], [class*="Conversation"], ' +
        '[class*="message-thread"], [class*="MessageThread"], ' +
        '[class*="inbox-item"], [class*="InboxItem"], ' +
        '[data-testid*="conversation"], [data-testid*="message"]'
      );

      threadEls.forEach((el, i) => {
        if (i >= 30) return;

        const nameEl = el.querySelector(
          '[class*="name"], [class*="Name"], [class*="sender"], h3, h4'
        );
        const previewEl = el.querySelector(
          '[class*="preview"], [class*="Preview"], [class*="snippet"], [class*="last-message"], p'
        );
        const timeEl = el.querySelector(
          'time, [class*="time"], [class*="Time"], [class*="date"], [class*="Date"]'
        );
        const linkEl = el.querySelector("a") as HTMLAnchorElement;
        const isUnread =
          el.classList.toString().toLowerCase().includes("unread") ||
          el.querySelector('[class*="unread"], [class*="Unread"], [class*="badge"]') !== null;

        const href = linkEl?.href || "";
        const threadId = href.split("/").filter(Boolean).pop() || `thread-${i}`;

        if (nameEl?.textContent?.trim()) {
          items.push({
            threadId,
            ownerName: nameEl.textContent.trim(),
            lastMessage: previewEl?.textContent?.trim() || "",
            lastMessageTime:
              (timeEl as HTMLTimeElement)?.dateTime ||
              timeEl?.textContent?.trim() || "",
            isUnread,
            threadUrl: href,
          });
        }
      });

      return items;
    });

    return threads;
  }

  async getThreadMessages(threadUrl: string): Promise<ThreadMessage[]> {
    this.ensureLoggedIn();
    const page = this.ensurePage();

    const url = threadUrl.startsWith("http")
      ? threadUrl
      : `${this.BASE_URL}/dashboard/messages/${threadUrl}/`;

    await page.goto(url, { waitUntil: "domcontentloaded" });
    await humanWaitForLoad(page);

    const messages = await page.evaluate(() => {
      const items: Array<{
        sender: string;
        text: string;
        timestamp: string;
        isOwner: boolean;
      }> = [];

      const msgEls = document.querySelectorAll(
        '[class*="message-item"], [class*="MessageItem"], ' +
        '[class*="chat-message"], [class*="ChatMessage"], ' +
        '[class*="message-bubble"], [class*="MessageBubble"]'
      );

      msgEls.forEach((el) => {
        const sender = el.querySelector(
          '[class*="sender"], [class*="Sender"], [class*="author"], [class*="name"]'
        );
        const text = el.querySelector(
          '[class*="text"], [class*="body"], [class*="content"], p'
        );
        const time = el.querySelector('time, [class*="time"], [class*="timestamp"]');

        const classes = el.classList.toString().toLowerCase();
        const isOwner =
          classes.includes("received") ||
          classes.includes("incoming") ||
          classes.includes("other") ||
          classes.includes("left") ||
          (!classes.includes("sent") && !classes.includes("outgoing") && !classes.includes("self"));

        items.push({
          sender: sender?.textContent?.trim() || (isOwner ? "Owner" : "You"),
          text: text?.textContent?.trim() || "",
          timestamp:
            (time as HTMLTimeElement)?.dateTime ||
            time?.textContent?.trim() || "",
          isOwner,
        });
      });

      return items;
    });

    return messages;
  }

  async pollInbox(): Promise<InboxPollResult> {
    const threads = await this.getInboxThreads();
    const now = new Date().toISOString();

    const newThreads: InboxThread[] = [];
    const updatedThreads: InboxThread[] = [];

    for (const thread of threads) {
      if (!this.knownThreadIds.has(thread.threadId)) {
        newThreads.push(thread);
        this.knownThreadIds.add(thread.threadId);
      } else if (thread.isUnread) {
        updatedThreads.push(thread);
      }
    }

    this.lastPollTime = now;

    return { newThreads, updatedThreads, timestamp: now };
  }

  // ── Reply to owner ───────────────────────────────────────────────────────

  async replyToThread(threadUrl: string, message: string): Promise<{ success: boolean }> {
    this.ensureLoggedIn();
    const page = this.ensurePage();

    const url = threadUrl.startsWith("http")
      ? threadUrl
      : `${this.BASE_URL}/dashboard/messages/${threadUrl}/`;

    await page.goto(url, { waitUntil: "domcontentloaded" });
    await humanWaitForLoad(page);

    // Simulate reading the conversation (human behavior)
    await humanDelay(randInt(3000, 6000), 0.3);

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await humanDelay(randInt(800, 1500));

    // Find reply textarea
    const textareaSelector =
      'textarea, [contenteditable="true"], ' +
      '[class*="reply"] textarea, [class*="Reply"] textarea, ' +
      '[class*="compose"] textarea, [class*="Compose"] textarea, ' +
      '[data-testid*="reply"], [data-testid*="message-input"]';

    const textarea = page.locator(textareaSelector).first();
    const isVisible = await textarea.isVisible().catch(() => false);

    if (!isVisible) {
      const replyBtn = page.locator(
        'button:has-text("Reply"), button:has-text("Message"), ' +
        'a:has-text("Reply"), [class*="reply-button"]'
      ).first();
      if (await replyBtn.isVisible().catch(() => false)) {
        await humanClick(page, 'button:has-text("Reply"), button:has-text("Message")');
        await humanDelay(1000);
      }
    }

    // Type reply with human timing
    try {
      await humanType(page, textareaSelector, message);
    } catch {
      await textarea.click();
      await humanDelay(300);
      for (const char of message) {
        await page.keyboard.type(char, { delay: 0 });
        await new Promise((r) => setTimeout(r, randInt(30, 90)));
      }
    }

    // Pause before sending (human reads what they typed)
    await humanDelay(randInt(1500, 3500), 0.3);

    // Send
    const sendSelector =
      'button[type="submit"], button:has-text("Send"), ' +
      '[class*="send-button"], [class*="SendButton"], ' +
      '[data-testid*="send"]';

    const sendBtn = page.locator(sendSelector).first();
    if (await sendBtn.isVisible().catch(() => false)) {
      await humanClick(page, sendSelector);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await humanDelay(2000, 0.3);
      if (this.context) await saveCookies(this.context);
      return { success: true };
    }

    // Fallback: Enter key
    await page.keyboard.press("Enter");
    await humanDelay(2000);
    if (this.context) await saveCookies(this.context);
    return { success: true };
  }

  // ── Sitter dashboard stats ───────────────────────────────────────────────

  async getSitterStats(): Promise<SitterStats> {
    this.ensureLoggedIn();
    const page = this.ensurePage();

    await page.goto(`${this.BASE_URL}/dashboard/`, {
      waitUntil: "domcontentloaded",
    });
    await humanWaitForLoad(page);

    const stats = await page.evaluate(() => {
      const getText = (selectors: string): string | undefined => {
        for (const sel of selectors.split(",")) {
          const el = document.querySelector(sel.trim());
          if (el?.textContent?.trim()) return el.textContent.trim();
        }
        return undefined;
      };

      return {
        responseRate: getText(
          '[class*="response-rate"], [class*="ResponseRate"], [data-testid*="response-rate"]'
        ),
        responseTime: getText(
          '[class*="response-time"], [class*="ResponseTime"], [data-testid*="response-time"]'
        ),
        bookingRate: getText(
          '[class*="booking-rate"], [class*="BookingRate"], [data-testid*="booking-rate"], [class*="booking-score"]'
        ),
        repeatScore: getText(
          '[class*="repeat"], [class*="Repeat"], [data-testid*="repeat"]'
        ),
        reviewAverage: getText(
          '[class*="rating"], [class*="Rating"], [class*="review-average"], [class*="star-rating"]'
        ),
        isStarSitter:
          document.querySelector(
            '[class*="star-sitter"], [class*="StarSitter"], [alt*="Star Sitter"], [title*="Star Sitter"]'
          ) !== null,
      };
    });

    return stats;
  }

  // ── Utility ──────────────────────────────────────────────────────────────

  private async humanScroll(page: Page, times: number): Promise<void> {
    for (let i = 0; i < times; i++) {
      const distance = randInt(200, 500);
      await page.mouse.wheel(0, distance);
      await humanDelay(randInt(800, 2000), 0.4);
    }
  }

  getSession(): RoverSession {
    return this.session;
  }

  getNextPollInterval(): number {
    const baseMs = randInt(180_000, 480_000); // 3-8 minutes
    return nextPollInterval(baseMs);
  }
}
