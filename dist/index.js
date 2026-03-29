#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const zod_1 = require("zod");
const browser_js_1 = require("./browser.js");
const browser = new browser_js_1.RoverBrowser();
let browserInitialized = false;
async function ensureBrowser() {
    if (!browserInitialized) {
        await browser.initialize(true);
        browserInitialized = true;
    }
}
// ── Tool definitions (sitter-side) ───────────────────────────────────────────
const tools = [
    {
        name: "login",
        description: "Log in to your Rover sitter account. Credentials are used for this session only and never stored. Cookies are saved locally for session persistence.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "Your Rover account email" },
                password: { type: "string", description: "Your Rover account password" },
            },
            required: ["email", "password"],
        },
    },
    {
        name: "get_inbox",
        description: "Get all message threads in your sitter inbox. Shows owner name, last message preview, time, and unread status.",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
    {
        name: "poll_inbox",
        description: "Check for new or unread messages since last poll. Returns only new threads and threads with new unread messages. Use this for monitoring.",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
    {
        name: "read_thread",
        description: "Read the full message history for a specific conversation thread. Returns all messages with sender, text, and timestamp.",
        inputSchema: {
            type: "object",
            properties: {
                threadUrl: {
                    type: "string",
                    description: "Thread URL or ID from get_inbox results",
                },
            },
            required: ["threadUrl"],
        },
    },
    {
        name: "reply",
        description: "Send a reply message in an existing conversation thread. Types with human-like timing and delays.",
        inputSchema: {
            type: "object",
            properties: {
                threadUrl: {
                    type: "string",
                    description: "Thread URL or ID to reply in",
                },
                message: {
                    type: "string",
                    description: "Your reply message text",
                },
            },
            required: ["threadUrl", "message"],
        },
    },
    {
        name: "get_stats",
        description: "Get your sitter performance scores from the dashboard: response rate, response time, booking rate, repeat score, review average, and Star Sitter status.",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
    {
        name: "next_poll_time",
        description: "Get the recommended wait time (in ms) before the next inbox poll. Uses gaussian jitter to avoid clockwork timing patterns.",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
];
// ── Validation schemas ───────────────────────────────────────────────────────
const LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
const ReadThreadSchema = zod_1.z.object({
    threadUrl: zod_1.z.string().min(1),
});
const ReplySchema = zod_1.z.object({
    threadUrl: zod_1.z.string().min(1),
    message: zod_1.z.string().min(1),
});
// ── Server ───────────────────────────────────────────────────────────────────
const server = new index_js_1.Server({ name: "mcp-rover-sitter", version: "2.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        await ensureBrowser();
        switch (name) {
            case "login": {
                const { email, password } = LoginSchema.parse(args);
                const session = await browser.login(email, password);
                return {
                    content: [
                        {
                            type: "text",
                            text: session.isLoggedIn
                                ? `Logged in as ${session.email}. Session cookies saved.`
                                : "Login failed. Check credentials.",
                        },
                    ],
                };
            }
            case "get_inbox": {
                const threads = await browser.getInboxThreads();
                if (threads.length === 0) {
                    return { content: [{ type: "text", text: "No messages in inbox." }] };
                }
                const formatted = threads
                    .map((t, i) => `${i + 1}. ${t.isUnread ? "[UNREAD] " : ""}**${t.ownerName}**\n` +
                    `   "${t.lastMessage}"\n` +
                    `   ${t.lastMessageTime}\n` +
                    `   Thread: ${t.threadUrl}`)
                    .join("\n\n");
                return {
                    content: [
                        {
                            type: "text",
                            text: `${threads.length} threads:\n\n${formatted}`,
                        },
                    ],
                };
            }
            case "poll_inbox": {
                const result = await browser.pollInbox();
                const parts = [];
                if (result.newThreads.length > 0) {
                    parts.push(`**${result.newThreads.length} NEW thread(s):**\n` +
                        result.newThreads
                            .map((t) => `  - ${t.ownerName}: "${t.lastMessage}"\n    Thread: ${t.threadUrl}`)
                            .join("\n"));
                }
                if (result.updatedThreads.length > 0) {
                    parts.push(`**${result.updatedThreads.length} thread(s) with new messages:**\n` +
                        result.updatedThreads
                            .map((t) => `  - ${t.ownerName}: "${t.lastMessage}"\n    Thread: ${t.threadUrl}`)
                            .join("\n"));
                }
                if (parts.length === 0) {
                    parts.push("No new messages.");
                }
                return {
                    content: [
                        {
                            type: "text",
                            text: parts.join("\n\n") + `\n\nPolled at: ${result.timestamp}`,
                        },
                    ],
                };
            }
            case "read_thread": {
                const { threadUrl } = ReadThreadSchema.parse(args);
                const messages = await browser.getThreadMessages(threadUrl);
                if (messages.length === 0) {
                    return { content: [{ type: "text", text: "No messages in this thread." }] };
                }
                const formatted = messages
                    .map((m) => `**${m.sender}** (${m.timestamp}):\n  ${m.text}`)
                    .join("\n\n");
                return { content: [{ type: "text", text: formatted }] };
            }
            case "reply": {
                const { threadUrl, message } = ReplySchema.parse(args);
                const result = await browser.replyToThread(threadUrl, message);
                return {
                    content: [
                        {
                            type: "text",
                            text: result.success
                                ? "Reply sent."
                                : "Failed to send reply.",
                        },
                    ],
                };
            }
            case "get_stats": {
                const stats = await browser.getSitterStats();
                const lines = [
                    stats.responseRate ? `Response rate: ${stats.responseRate}` : null,
                    stats.responseTime ? `Response time: ${stats.responseTime}` : null,
                    stats.bookingRate ? `Booking rate: ${stats.bookingRate}` : null,
                    stats.repeatScore ? `Repeat score: ${stats.repeatScore}` : null,
                    stats.reviewAverage ? `Review average: ${stats.reviewAverage}` : null,
                    stats.isStarSitter ? "Star Sitter: Yes" : null,
                ].filter(Boolean);
                return {
                    content: [
                        {
                            type: "text",
                            text: lines.length > 0
                                ? lines.join("\n")
                                : "Could not read dashboard stats. DOM selectors may need updating.",
                        },
                    ],
                };
            }
            case "next_poll_time": {
                const ms = browser.getNextPollInterval();
                const minutes = (ms / 60_000).toFixed(1);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Next poll in ${minutes} minutes (${ms}ms).`,
                        },
                    ],
                };
            }
            default:
                return {
                    content: [{ type: "text", text: `Unknown tool: ${name}` }],
                    isError: true,
                };
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${message}` }],
            isError: true,
        };
    }
});
// ── Shutdown ─────────────────────────────────────────────────────────────────
async function shutdown() {
    if (browserInitialized) {
        await browser.close();
    }
    process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// ── Start ────────────────────────────────────────────────────────────────────
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("mcp-rover-sitter v2.0.0 running on stdio");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map