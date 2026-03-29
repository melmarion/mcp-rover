#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { RoverBrowser } from "./browser.js";
import {
  analyzeConversation,
  buildSystemPrompt,
  buildUserPrompt,
  calculatePricing,
} from "./responder.js";

const browser = new RoverBrowser();
let browserInitialized = false;

async function ensureBrowser(): Promise<void> {
  if (!browserInitialized) {
    await browser.initialize(true);
    browserInitialized = true;
  }
}

// ── Tool definitions (sitter-side) ───────────────────────────────────────────

const tools: Tool[] = [
  {
    name: "login",
    description:
      "Log in to your Rover sitter account. Credentials are used for this session only and never stored. Cookies are saved locally for session persistence.",
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
    description:
      "Get all message threads in your sitter inbox. Shows owner name, last message preview, time, and unread status.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "poll_inbox",
    description:
      "Check for new or unread messages since last poll. Returns only new threads and threads with new unread messages. Use this for monitoring.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "read_thread",
    description:
      "Read the full message history for a specific conversation thread. Returns all messages with sender, text, and timestamp.",
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
    description:
      "Send a reply message in an existing conversation thread. Types with human-like timing and delays.",
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
    description:
      "Get your sitter performance scores from the dashboard: response rate, response time, booking rate, repeat score, review average, and Star Sitter status.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "next_poll_time",
    description:
      "Get the recommended wait time (in ms) before the next inbox poll. Uses gaussian jitter to avoid clockwork timing patterns.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "analyze_thread",
    description:
      "Analyze a conversation thread and return the owner context, conversation stage, detected concerns, pricing strategy, and the full LLM prompt ready to generate a reply. Does NOT send anything — just prepares the response.",
    inputSchema: {
      type: "object",
      properties: {
        threadUrl: {
          type: "string",
          description: "Thread URL or ID to analyze",
        },
        ownerName: {
          type: "string",
          description: "Owner's name (from inbox listing)",
        },
        baseRate: {
          type: "number",
          description: "Your base nightly rate in dollars (default: 99)",
        },
      },
      required: ["threadUrl", "ownerName"],
    },
  },
  {
    name: "draft_reply",
    description:
      "Generate a Persuasion-Max optimized reply for a conversation thread. Returns the system prompt and user prompt for your LLM (Ollama or Claude). Analyzes conversation stage, extracts pet details, concerns, and pricing strategy automatically. Does NOT send — review the draft first.",
    inputSchema: {
      type: "object",
      properties: {
        threadUrl: {
          type: "string",
          description: "Thread URL or ID",
        },
        ownerName: {
          type: "string",
          description: "Owner's name",
        },
        baseRate: {
          type: "number",
          description: "Your base nightly rate (default: 99)",
        },
      },
      required: ["threadUrl", "ownerName"],
    },
  },
];

// ── Validation schemas ───────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const ReadThreadSchema = z.object({
  threadUrl: z.string().min(1),
});

const ReplySchema = z.object({
  threadUrl: z.string().min(1),
  message: z.string().min(1),
});

const AnalyzeSchema = z.object({
  threadUrl: z.string().min(1),
  ownerName: z.string().min(1),
  baseRate: z.number().optional(),
});

const DraftReplySchema = z.object({
  threadUrl: z.string().min(1),
  ownerName: z.string().min(1),
  baseRate: z.number().optional(),
});

// ── Server ───────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "mcp-rover-sitter", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
          .map(
            (t, i) =>
              `${i + 1}. ${t.isUnread ? "[UNREAD] " : ""}**${t.ownerName}**\n` +
              `   "${t.lastMessage}"\n` +
              `   ${t.lastMessageTime}\n` +
              `   Thread: ${t.threadUrl}`
          )
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
        const parts: string[] = [];

        if (result.newThreads.length > 0) {
          parts.push(
            `**${result.newThreads.length} NEW thread(s):**\n` +
              result.newThreads
                .map(
                  (t) =>
                    `  - ${t.ownerName}: "${t.lastMessage}"\n    Thread: ${t.threadUrl}`
                )
                .join("\n")
          );
        }

        if (result.updatedThreads.length > 0) {
          parts.push(
            `**${result.updatedThreads.length} thread(s) with new messages:**\n` +
              result.updatedThreads
                .map(
                  (t) =>
                    `  - ${t.ownerName}: "${t.lastMessage}"\n    Thread: ${t.threadUrl}`
                )
                .join("\n")
          );
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
          .map(
            (m) =>
              `**${m.sender}** (${m.timestamp}):\n  ${m.text}`
          )
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
              text:
                lines.length > 0
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

      case "analyze_thread": {
        const { threadUrl, ownerName, baseRate } = AnalyzeSchema.parse(args);
        const messages = await browser.getThreadMessages(threadUrl);
        const ctx = analyzeConversation(messages, ownerName);
        const pricing = calculatePricing(ctx, baseRate || 99);

        const analysis = [
          `**Stage:** ${ctx.stage}`,
          `**Pet(s):** ${ctx.petNames.length > 0 ? ctx.petNames.join(", ") : "not yet identified"} (${ctx.petType})`,
          `**Dates:** ${ctx.dates || "not discussed"}`,
          `**Long-term:** ${ctx.isLongTerm ? "yes" : "no"}`,
          `**Multi-pet:** ${ctx.isMultiPet ? "yes" : "no"}`,
          `**Concerns:** ${ctx.concerns.length > 0 ? ctx.concerns.join(", ") : "none detected"}`,
          `**Questions:** ${ctx.questionsAsked.length > 0 ? ctx.questionsAsked.join(", ") : "none"}`,
          `**Mentioned price:** ${ctx.mentionedPrice ? "yes" : "no"}`,
          `**Mentioned other sitters:** ${ctx.mentionedOtherSitters ? "yes" : "no"}`,
          `**Messages from owner:** ${ctx.messageCount}`,
          "",
          `**Pricing strategy:**`,
          `  Offer discount: ${pricing.shouldOffer ? "yes" : "no"}`,
          `  Rate: $${pricing.offeredRate}/night${pricing.shouldOffer ? ` (from $${pricing.originalRate})` : ""}`,
          `  Framing: ${pricing.framing}`,
        ].join("\n");

        return { content: [{ type: "text", text: analysis }] };
      }

      case "draft_reply": {
        const { threadUrl, ownerName, baseRate } = DraftReplySchema.parse(args);
        const messages = await browser.getThreadMessages(threadUrl);
        const ctx = analyzeConversation(messages, ownerName);
        const pricing = calculatePricing(ctx, baseRate || 99);
        const systemPrompt = buildSystemPrompt(ctx);
        const userPrompt = buildUserPrompt(messages, ctx);

        const output = [
          `**Conversation stage:** ${ctx.stage}`,
          `**Pricing:** ${pricing.shouldOffer ? `offer $${pricing.offeredRate}/night — ${pricing.framing}` : `hold at $${pricing.originalRate}`}`,
          `**Detected:** pets=[${ctx.petNames.join(",")}] concerns=[${ctx.concerns.join(",")}] questions=[${ctx.questionsAsked.join(",")}]`,
          "",
          "---",
          "",
          "**SYSTEM PROMPT** (pass to Ollama or Claude):",
          "",
          systemPrompt,
          "",
          "---",
          "",
          "**USER PROMPT:**",
          "",
          userPrompt,
        ].join("\n");

        return { content: [{ type: "text", text: output }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ── Shutdown ─────────────────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  if (browserInitialized) {
    await browser.close();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ── Start ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-rover-sitter v2.0.0 running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
