"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoverBrowser = void 0;
const playwright_1 = require("playwright");
const stealth_js_1 = require("./stealth.js");
// ── Sitter-side browser with full stealth ────────────────────────────────────
class RoverBrowser {
    browser = null;
    context = null;
    page = null;
    session = { isLoggedIn: false, isSitter: false };
    BASE_URL = "https://www.rover.com";
    knownThreadIds = new Set();
    lastPollTime = null;
    /**
     * Launch browser with stealth configuration.
     * Mirrors LinkedIn anti-detection: real fingerprint, no webdriver leak,
     * cookie persistence, randomized viewport.
     */
    async initialize(headless = true) {
        const profile = (0, stealth_js_1.randomProfile)();
        this.browser = await playwright_1.chromium.launch({
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
        await this.context.addInitScript(stealth_js_1.STEALTH_INIT_SCRIPT);
        this.page = await this.context.newPage();
        // Try to restore saved session
        const restored = await (0, stealth_js_1.loadCookies)(this.context);
        if (restored) {
            await this.page.goto(`${this.BASE_URL}/account/`, {
                waitUntil: "domcontentloaded",
            });
            await (0, stealth_js_1.humanDelay)(1500);
            const url = this.page.url();
            if (!url.includes("/login") && !url.includes("/signin")) {
                this.session = { isLoggedIn: true, isSitter: true };
            }
        }
    }
    async close() {
        if (this.context && this.session.isLoggedIn) {
            await (0, stealth_js_1.saveCookies)(this.context);
        }
        if (this.page)
            await this.page.close();
        if (this.context)
            await this.context.close();
        if (this.browser)
            await this.browser.close();
        this.browser = null;
        this.context = null;
        this.page = null;
    }
    ensurePage() {
        if (!this.page)
            throw new Error("Browser not initialized. Call initialize() first.");
        return this.page;
    }
    ensureLoggedIn() {
        if (!this.session.isLoggedIn) {
            throw new Error("You must be logged in. Call login() first.");
        }
    }
    // ── Authentication ───────────────────────────────────────────────────────
    async login(email, password) {
        const page = this.ensurePage();
        await page.goto(`${this.BASE_URL}/login/`, {
            waitUntil: "domcontentloaded",
        });
        await (0, stealth_js_1.humanDelay)(2000, 0.4);
        await (0, stealth_js_1.humanDelay)((0, stealth_js_1.randInt)(500, 1500));
        const emailSelector = 'input[name="email"], input[type="email"]';
        await page.waitForSelector(emailSelector, { timeout: 10000 });
        await (0, stealth_js_1.humanType)(page, emailSelector, email);
        await (0, stealth_js_1.humanDelay)((0, stealth_js_1.randInt)(300, 800));
        const passSelector = 'input[name="password"], input[type="password"]';
        await (0, stealth_js_1.humanType)(page, passSelector, password);
        await (0, stealth_js_1.humanDelay)((0, stealth_js_1.randInt)(400, 1000));
        const submitSelector = 'button[type="submit"], input[type="submit"]';
        await (0, stealth_js_1.humanClick)(page, submitSelector);
        await page.waitForLoadState("domcontentloaded");
        await (0, stealth_js_1.humanDelay)(3000, 0.3);
        const url = page.url();
        const loggedIn = !url.includes("/login") && !url.includes("/signin");
        if (loggedIn && this.context) {
            await (0, stealth_js_1.saveCookies)(this.context);
        }
        this.session = {
            isLoggedIn: loggedIn,
            email: loggedIn ? email : undefined,
            isSitter: loggedIn,
        };
        return this.session;
    }
    // ── Inbox monitoring (sitter side) ───────────────────────────────────────
    async getInboxThreads() {
        this.ensureLoggedIn();
        const page = this.ensurePage();
        await page.goto(`${this.BASE_URL}/dashboard/messages/`, {
            waitUntil: "domcontentloaded",
        });
        await (0, stealth_js_1.humanWaitForLoad)(page);
        await this.humanScroll(page, (0, stealth_js_1.randInt)(2, 4));
        const threads = await page.evaluate(() => {
            const items = [];
            const threadEls = document.querySelectorAll('[class*="conversation"], [class*="Conversation"], ' +
                '[class*="message-thread"], [class*="MessageThread"], ' +
                '[class*="inbox-item"], [class*="InboxItem"], ' +
                '[data-testid*="conversation"], [data-testid*="message"]');
            threadEls.forEach((el, i) => {
                if (i >= 30)
                    return;
                const nameEl = el.querySelector('[class*="name"], [class*="Name"], [class*="sender"], h3, h4');
                const previewEl = el.querySelector('[class*="preview"], [class*="Preview"], [class*="snippet"], [class*="last-message"], p');
                const timeEl = el.querySelector('time, [class*="time"], [class*="Time"], [class*="date"], [class*="Date"]');
                const linkEl = el.querySelector("a");
                const isUnread = el.classList.toString().toLowerCase().includes("unread") ||
                    el.querySelector('[class*="unread"], [class*="Unread"], [class*="badge"]') !== null;
                const href = linkEl?.href || "";
                const threadId = href.split("/").filter(Boolean).pop() || `thread-${i}`;
                if (nameEl?.textContent?.trim()) {
                    items.push({
                        threadId,
                        ownerName: nameEl.textContent.trim(),
                        lastMessage: previewEl?.textContent?.trim() || "",
                        lastMessageTime: timeEl?.dateTime ||
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
    async getThreadMessages(threadUrl) {
        this.ensureLoggedIn();
        const page = this.ensurePage();
        const url = threadUrl.startsWith("http")
            ? threadUrl
            : `${this.BASE_URL}/dashboard/messages/${threadUrl}/`;
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await (0, stealth_js_1.humanWaitForLoad)(page);
        const messages = await page.evaluate(() => {
            const items = [];
            const msgEls = document.querySelectorAll('[class*="message-item"], [class*="MessageItem"], ' +
                '[class*="chat-message"], [class*="ChatMessage"], ' +
                '[class*="message-bubble"], [class*="MessageBubble"]');
            msgEls.forEach((el) => {
                const sender = el.querySelector('[class*="sender"], [class*="Sender"], [class*="author"], [class*="name"]');
                const text = el.querySelector('[class*="text"], [class*="body"], [class*="content"], p');
                const time = el.querySelector('time, [class*="time"], [class*="timestamp"]');
                const classes = el.classList.toString().toLowerCase();
                const isOwner = classes.includes("received") ||
                    classes.includes("incoming") ||
                    classes.includes("other") ||
                    classes.includes("left") ||
                    (!classes.includes("sent") && !classes.includes("outgoing") && !classes.includes("self"));
                items.push({
                    sender: sender?.textContent?.trim() || (isOwner ? "Owner" : "You"),
                    text: text?.textContent?.trim() || "",
                    timestamp: time?.dateTime ||
                        time?.textContent?.trim() || "",
                    isOwner,
                });
            });
            return items;
        });
        return messages;
    }
    async pollInbox() {
        const threads = await this.getInboxThreads();
        const now = new Date().toISOString();
        const newThreads = [];
        const updatedThreads = [];
        for (const thread of threads) {
            if (!this.knownThreadIds.has(thread.threadId)) {
                newThreads.push(thread);
                this.knownThreadIds.add(thread.threadId);
            }
            else if (thread.isUnread) {
                updatedThreads.push(thread);
            }
        }
        this.lastPollTime = now;
        return { newThreads, updatedThreads, timestamp: now };
    }
    // ── Reply to owner ───────────────────────────────────────────────────────
    async replyToThread(threadUrl, message) {
        this.ensureLoggedIn();
        const page = this.ensurePage();
        const url = threadUrl.startsWith("http")
            ? threadUrl
            : `${this.BASE_URL}/dashboard/messages/${threadUrl}/`;
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await (0, stealth_js_1.humanWaitForLoad)(page);
        // Simulate reading the conversation (human behavior)
        await (0, stealth_js_1.humanDelay)((0, stealth_js_1.randInt)(3000, 6000), 0.3);
        // Scroll to bottom
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await (0, stealth_js_1.humanDelay)((0, stealth_js_1.randInt)(800, 1500));
        // Find reply textarea
        const textareaSelector = 'textarea, [contenteditable="true"], ' +
            '[class*="reply"] textarea, [class*="Reply"] textarea, ' +
            '[class*="compose"] textarea, [class*="Compose"] textarea, ' +
            '[data-testid*="reply"], [data-testid*="message-input"]';
        const textarea = page.locator(textareaSelector).first();
        const isVisible = await textarea.isVisible().catch(() => false);
        if (!isVisible) {
            const replyBtn = page.locator('button:has-text("Reply"), button:has-text("Message"), ' +
                'a:has-text("Reply"), [class*="reply-button"]').first();
            if (await replyBtn.isVisible().catch(() => false)) {
                await (0, stealth_js_1.humanClick)(page, 'button:has-text("Reply"), button:has-text("Message")');
                await (0, stealth_js_1.humanDelay)(1000);
            }
        }
        // Type reply with human timing
        try {
            await (0, stealth_js_1.humanType)(page, textareaSelector, message);
        }
        catch {
            await textarea.click();
            await (0, stealth_js_1.humanDelay)(300);
            for (const char of message) {
                await page.keyboard.type(char, { delay: 0 });
                await new Promise((r) => setTimeout(r, (0, stealth_js_1.randInt)(30, 90)));
            }
        }
        // Pause before sending (human reads what they typed)
        await (0, stealth_js_1.humanDelay)((0, stealth_js_1.randInt)(1500, 3500), 0.3);
        // Send
        const sendSelector = 'button[type="submit"], button:has-text("Send"), ' +
            '[class*="send-button"], [class*="SendButton"], ' +
            '[data-testid*="send"]';
        const sendBtn = page.locator(sendSelector).first();
        if (await sendBtn.isVisible().catch(() => false)) {
            await (0, stealth_js_1.humanClick)(page, sendSelector);
            await page.waitForLoadState("domcontentloaded").catch(() => { });
            await (0, stealth_js_1.humanDelay)(2000, 0.3);
            if (this.context)
                await (0, stealth_js_1.saveCookies)(this.context);
            return { success: true };
        }
        // Fallback: Enter key
        await page.keyboard.press("Enter");
        await (0, stealth_js_1.humanDelay)(2000);
        if (this.context)
            await (0, stealth_js_1.saveCookies)(this.context);
        return { success: true };
    }
    // ── Sitter dashboard stats ───────────────────────────────────────────────
    async getSitterStats() {
        this.ensureLoggedIn();
        const page = this.ensurePage();
        await page.goto(`${this.BASE_URL}/dashboard/`, {
            waitUntil: "domcontentloaded",
        });
        await (0, stealth_js_1.humanWaitForLoad)(page);
        const stats = await page.evaluate(() => {
            const getText = (selectors) => {
                for (const sel of selectors.split(",")) {
                    const el = document.querySelector(sel.trim());
                    if (el?.textContent?.trim())
                        return el.textContent.trim();
                }
                return undefined;
            };
            return {
                responseRate: getText('[class*="response-rate"], [class*="ResponseRate"], [data-testid*="response-rate"]'),
                responseTime: getText('[class*="response-time"], [class*="ResponseTime"], [data-testid*="response-time"]'),
                bookingRate: getText('[class*="booking-rate"], [class*="BookingRate"], [data-testid*="booking-rate"], [class*="booking-score"]'),
                repeatScore: getText('[class*="repeat"], [class*="Repeat"], [data-testid*="repeat"]'),
                reviewAverage: getText('[class*="rating"], [class*="Rating"], [class*="review-average"], [class*="star-rating"]'),
                isStarSitter: document.querySelector('[class*="star-sitter"], [class*="StarSitter"], [alt*="Star Sitter"], [title*="Star Sitter"]') !== null,
            };
        });
        return stats;
    }
    // ── Owner pet profile scraping ────────────────────────────────────────────
    /**
     * Scrape the owner's pet profile from their Rover account.
     * Called from the message thread — Rover shows a link to the owner's
     * profile with their pet details (name, breed, age, temperament, etc).
     *
     * This is the key advantage over autobook: we know the cat's name and
     * details before the owner even mentions them.
     */
    async getOwnerPetProfile(threadUrl) {
        this.ensureLoggedIn();
        const page = this.ensurePage();
        // Navigate to the thread to find the owner's profile link
        const url = threadUrl.startsWith("http")
            ? threadUrl
            : `${this.BASE_URL}/dashboard/messages/${threadUrl}/`;
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await (0, stealth_js_1.humanWaitForLoad)(page);
        // Find and click the owner's profile / pet info link
        // Rover typically shows pet details in the booking request or thread header
        const profileData = await page.evaluate(() => {
            const data = {
                ownerName: "",
                pets: [],
                profileUrl: window.location.href,
            };
            // Owner name — usually in thread header
            const nameEl = document.querySelector('[class*="owner-name"], [class*="OwnerName"], ' +
                '[class*="client-name"], [class*="ClientName"], ' +
                '[class*="contact-name"], [class*="ContactName"], ' +
                '.convo-name, [class*="participant"]');
            data.ownerName = nameEl?.textContent?.trim() || "";
            // Pet details — Rover shows these in the booking request card
            // or in a sidebar/header section of the conversation
            const petCards = document.querySelectorAll('[class*="pet-card"], [class*="PetCard"], ' +
                '[class*="pet-info"], [class*="PetInfo"], ' +
                '[class*="pet-detail"], [class*="PetDetail"], ' +
                '[data-testid*="pet"], [class*="animal-info"]');
            petCards.forEach((card) => {
                const petName = card.querySelector('[class*="pet-name"], [class*="PetName"], ' +
                    '[class*="name"], h3, h4, strong')?.textContent?.trim() || "";
                const breed = card.querySelector('[class*="breed"], [class*="Breed"]')?.textContent?.trim();
                const age = card.querySelector('[class*="age"], [class*="Age"]')?.textContent?.trim();
                const weight = card.querySelector('[class*="weight"], [class*="Weight"]')?.textContent?.trim();
                const size = card.querySelector('[class*="size"], [class*="Size"]')?.textContent?.trim();
                const temperament = card.querySelector('[class*="temperament"], [class*="Temperament"], ' +
                    '[class*="personality"], [class*="description"]')?.textContent?.trim();
                const specialNeeds = card.querySelector('[class*="special"], [class*="Special"], ' +
                    '[class*="needs"], [class*="medical"]')?.textContent?.trim();
                const photoEl = card.querySelector("img");
                // Detect species from context
                const cardText = card.textContent?.toLowerCase() || "";
                const isCat = /\bcat|kitten|feline\b/.test(cardText);
                const isDog = /\bdog|puppy|canine\b/.test(cardText);
                const species = isCat ? "cat" : isDog ? "dog" : "cat";
                if (petName) {
                    data.pets.push({
                        name: petName,
                        species,
                        breed: breed || undefined,
                        age: age || undefined,
                        weight: weight || undefined,
                        size: size || undefined,
                        temperament: temperament || undefined,
                        specialNeeds: specialNeeds || undefined,
                        photoUrl: photoEl?.src || undefined,
                    });
                }
            });
            // If no pet cards found, try to extract from the booking request text
            if (data.pets.length === 0) {
                const bookingInfo = document.querySelector('[class*="booking-request"], [class*="BookingRequest"], ' +
                    '[class*="request-info"], [class*="RequestInfo"], ' +
                    '[class*="stay-details"], [class*="StayDetails"]');
                if (bookingInfo) {
                    const text = bookingInfo.textContent || "";
                    // Try to extract pet name from common patterns
                    const nameMatch = text.match(/(?:for|about|regarding)\s+([A-Z][a-z]+)/);
                    if (nameMatch) {
                        data.pets.push({
                            name: nameMatch[1],
                            species: /cat|kitten/i.test(text) ? "cat" : "dog",
                        });
                    }
                }
            }
            // Dates from booking request
            const datesEl = document.querySelector('[class*="dates"], [class*="Dates"], ' +
                '[class*="stay-dates"], [class*="StayDates"]');
            data.dates = datesEl?.textContent?.trim() || undefined;
            // Service type
            const serviceEl = document.querySelector('[class*="service-type"], [class*="ServiceType"], ' +
                '[class*="service"], [class*="Service"]');
            data.serviceType = serviceEl?.textContent?.trim() || undefined;
            // Location
            const locationEl = document.querySelector('[class*="location"], [class*="Location"], ' +
                '[class*="address"]');
            data.location = locationEl?.textContent?.trim() || undefined;
            return data;
        });
        if (!profileData.ownerName && profileData.pets.length === 0) {
            return null;
        }
        return {
            ownerName: profileData.ownerName,
            pets: profileData.pets,
            location: profileData.location,
            profileUrl: profileData.profileUrl,
        };
    }
    // ── Utility ──────────────────────────────────────────────────────────────
    async humanScroll(page, times) {
        for (let i = 0; i < times; i++) {
            const distance = (0, stealth_js_1.randInt)(200, 500);
            await page.mouse.wheel(0, distance);
            await (0, stealth_js_1.humanDelay)((0, stealth_js_1.randInt)(800, 2000), 0.4);
        }
    }
    getSession() {
        return this.session;
    }
    getNextPollInterval() {
        const baseMs = (0, stealth_js_1.randInt)(180_000, 480_000); // 3-8 minutes
        return (0, stealth_js_1.nextPollInterval)(baseMs);
    }
}
exports.RoverBrowser = RoverBrowser;
//# sourceMappingURL=browser.js.map