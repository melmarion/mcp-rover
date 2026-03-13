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
// ── Tool definitions ──────────────────────────────────────────────────────────
const tools = [
    {
        name: "login",
        description: "Log in to Rover with your email and password. Required before most operations.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "Your Rover account email address" },
                password: { type: "string", description: "Your Rover account password" },
            },
            required: ["email", "password"],
        },
    },
    {
        name: "search_sitters",
        description: "Search for pet sitters on Rover by location and service type. Returns a list of available sitters with ratings and pricing.",
        inputSchema: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "City, neighborhood, or zip code to search in (e.g. 'Seattle, WA' or '98101')",
                },
                serviceType: {
                    type: "string",
                    enum: ["boarding", "house_sitting", "drop_in", "doggy_day_care", "dog_walking"],
                    description: "Type of pet care service",
                },
                startDate: {
                    type: "string",
                    description: "Start date in YYYY-MM-DD format",
                },
                endDate: {
                    type: "string",
                    description: "End date in YYYY-MM-DD format",
                },
                petCount: {
                    type: "number",
                    description: "Number of pets",
                },
                petSize: {
                    type: "string",
                    enum: ["small", "medium", "large", "giant"],
                    description: "Size of your pet",
                },
            },
            required: ["location", "serviceType"],
        },
    },
    {
        name: "get_sitter_profile",
        description: "Get detailed profile information for a specific sitter including bio, reviews, services offered, and rates.",
        inputSchema: {
            type: "object",
            properties: {
                sitterIdOrUrl: {
                    type: "string",
                    description: "Sitter's Rover username/ID or full profile URL",
                },
            },
            required: ["sitterIdOrUrl"],
        },
    },
    {
        name: "search_services",
        description: "List all available Rover service types in a given location with descriptions.",
        inputSchema: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "Location to search for available services",
                },
            },
            required: ["location"],
        },
    },
    {
        name: "request_booking",
        description: "Send a booking request to a sitter. Requires being logged in.",
        inputSchema: {
            type: "object",
            properties: {
                sitterId: {
                    type: "string",
                    description: "Sitter's Rover username/ID or profile URL",
                },
                serviceType: {
                    type: "string",
                    enum: ["boarding", "house_sitting", "drop_in", "doggy_day_care", "dog_walking"],
                    description: "Type of service to book",
                },
                startDate: {
                    type: "string",
                    description: "Start date in YYYY-MM-DD format",
                },
                endDate: {
                    type: "string",
                    description: "End date in YYYY-MM-DD format",
                },
                petIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of pet IDs to include in the booking",
                },
                message: {
                    type: "string",
                    description: "Optional introductory message to the sitter",
                },
            },
            required: ["sitterId", "serviceType", "startDate", "endDate", "petIds"],
        },
    },
    {
        name: "get_bookings",
        description: "View your current and past bookings on Rover. Requires being logged in.",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
    {
        name: "message_sitter",
        description: "Send a message to a sitter on Rover. Requires being logged in.",
        inputSchema: {
            type: "object",
            properties: {
                sitterId: {
                    type: "string",
                    description: "Sitter's Rover username/ID or profile URL",
                },
                message: {
                    type: "string",
                    description: "Message text to send to the sitter",
                },
            },
            required: ["sitterId", "message"],
        },
    },
    {
        name: "get_messages",
        description: "Get your message threads on Rover. Optionally filter by sitter ID.",
        inputSchema: {
            type: "object",
            properties: {
                sitterId: {
                    type: "string",
                    description: "Optional sitter ID to get messages from a specific thread",
                },
            },
            required: [],
        },
    },
    {
        name: "add_pet_profile",
        description: "Add a new pet to your Rover account. Requires being logged in.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Pet's name" },
                species: {
                    type: "string",
                    enum: ["dog", "cat", "other"],
                    description: "Pet species",
                },
                breed: { type: "string", description: "Pet's breed" },
                age: { type: "number", description: "Pet's age in years" },
                weight: { type: "number", description: "Pet's weight in pounds" },
                size: {
                    type: "string",
                    enum: ["small", "medium", "large", "giant"],
                    description: "Pet size category",
                },
                temperament: {
                    type: "string",
                    description: "Description of pet's temperament and personality",
                },
                specialNeeds: {
                    type: "string",
                    description: "Any special needs, medical conditions, or care requirements",
                },
                vaccinated: {
                    type: "boolean",
                    description: "Whether the pet is up to date on vaccinations",
                },
                spayedNeutered: {
                    type: "boolean",
                    description: "Whether the pet is spayed or neutered",
                },
            },
            required: ["name", "species"],
        },
    },
    {
        name: "update_pet_profile",
        description: "Update an existing pet's profile details such as size, temperament, and special needs.",
        inputSchema: {
            type: "object",
            properties: {
                petId: { type: "string", description: "The pet's ID on Rover" },
                name: { type: "string", description: "Updated pet name" },
                breed: { type: "string", description: "Updated breed" },
                age: { type: "number", description: "Updated age in years" },
                weight: { type: "number", description: "Updated weight in pounds" },
                size: {
                    type: "string",
                    enum: ["small", "medium", "large", "giant"],
                    description: "Updated size category",
                },
                temperament: { type: "string", description: "Updated temperament description" },
                specialNeeds: { type: "string", description: "Updated special needs or care notes" },
                vaccinated: { type: "boolean", description: "Updated vaccination status" },
                spayedNeutered: { type: "boolean", description: "Updated spayed/neutered status" },
            },
            required: ["petId"],
        },
    },
    {
        name: "get_pets",
        description: "List all pets registered on your Rover account. Requires being logged in.",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
    {
        name: "leave_review",
        description: "Leave a review for a sitter after a completed service. Requires being logged in.",
        inputSchema: {
            type: "object",
            properties: {
                bookingId: {
                    type: "string",
                    description: "The booking ID for the completed service",
                },
                rating: {
                    type: "number",
                    description: "Rating from 1 to 5 stars",
                    minimum: 1,
                    maximum: 5,
                },
                reviewText: {
                    type: "string",
                    description: "Written review describing your experience",
                },
            },
            required: ["bookingId", "rating", "reviewText"],
        },
    },
    {
        name: "get_favorites",
        description: "Get your list of favorited sitters on Rover. Requires being logged in.",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
];
// ── Input schemas (for validation) ───────────────────────────────────────────
const LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
const SearchSittersSchema = zod_1.z.object({
    location: zod_1.z.string().min(1),
    serviceType: zod_1.z.enum(["boarding", "house_sitting", "drop_in", "doggy_day_care", "dog_walking"]),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    petCount: zod_1.z.number().optional(),
    petSize: zod_1.z.enum(["small", "medium", "large", "giant"]).optional(),
});
const GetSitterProfileSchema = zod_1.z.object({
    sitterIdOrUrl: zod_1.z.string().min(1),
});
const SearchServicesSchema = zod_1.z.object({
    location: zod_1.z.string().min(1),
});
const RequestBookingSchema = zod_1.z.object({
    sitterId: zod_1.z.string().min(1),
    serviceType: zod_1.z.enum(["boarding", "house_sitting", "drop_in", "doggy_day_care", "dog_walking"]),
    startDate: zod_1.z.string().min(1),
    endDate: zod_1.z.string().min(1),
    petIds: zod_1.z.array(zod_1.z.string()),
    message: zod_1.z.string().optional(),
});
const MessageSitterSchema = zod_1.z.object({
    sitterId: zod_1.z.string().min(1),
    message: zod_1.z.string().min(1),
});
const GetMessagesSchema = zod_1.z.object({
    sitterId: zod_1.z.string().optional(),
});
const AddPetSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    species: zod_1.z.enum(["dog", "cat", "other"]),
    breed: zod_1.z.string().optional(),
    age: zod_1.z.number().optional(),
    weight: zod_1.z.number().optional(),
    size: zod_1.z.enum(["small", "medium", "large", "giant"]).optional(),
    temperament: zod_1.z.string().optional(),
    specialNeeds: zod_1.z.string().optional(),
    vaccinated: zod_1.z.boolean().optional(),
    spayedNeutered: zod_1.z.boolean().optional(),
});
const UpdatePetSchema = zod_1.z.object({
    petId: zod_1.z.string().min(1),
    name: zod_1.z.string().optional(),
    breed: zod_1.z.string().optional(),
    age: zod_1.z.number().optional(),
    weight: zod_1.z.number().optional(),
    size: zod_1.z.enum(["small", "medium", "large", "giant"]).optional(),
    temperament: zod_1.z.string().optional(),
    specialNeeds: zod_1.z.string().optional(),
    vaccinated: zod_1.z.boolean().optional(),
    spayedNeutered: zod_1.z.boolean().optional(),
});
const LeaveReviewSchema = zod_1.z.object({
    bookingId: zod_1.z.string().min(1),
    rating: zod_1.z.number().min(1).max(5),
    reviewText: zod_1.z.string().min(1),
});
// ── Server setup ──────────────────────────────────────────────────────────────
const server = new index_js_1.Server({ name: "@striderlabs/mcp-rover", version: "1.0.0" }, { capabilities: { tools: {} } });
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
                                ? `Successfully logged in as ${session.email}.`
                                : "Login failed. Please check your credentials.",
                        },
                    ],
                };
            }
            case "search_sitters": {
                const params = SearchSittersSchema.parse(args);
                const sitters = await browser.searchSitters(params);
                if (sitters.length === 0) {
                    return {
                        content: [{ type: "text", text: "No sitters found for the given criteria." }],
                    };
                }
                const formatted = sitters
                    .map((s, i) => `${i + 1}. **${s.name}** — ${s.location}\n` +
                    `   Rating: ${s.rating}/5 (${s.reviewCount} reviews)\n` +
                    `   Price: $${s.price}/${s.priceUnit}\n` +
                    `   Profile: ${s.profileUrl}` +
                    (s.summary ? `\n   "${s.summary}"` : ""))
                    .join("\n\n");
                return {
                    content: [
                        {
                            type: "text",
                            text: `Found ${sitters.length} sitters in ${params.location}:\n\n${formatted}`,
                        },
                    ],
                };
            }
            case "get_sitter_profile": {
                const { sitterIdOrUrl } = GetSitterProfileSchema.parse(args);
                const profile = await browser.getSitterProfile(sitterIdOrUrl);
                const reviewsText = profile.reviews.length > 0
                    ? profile.reviews
                        .slice(0, 5)
                        .map((r) => `  • ${r.authorName} (${r.rating}/5, ${r.date}): "${r.text}"`)
                        .join("\n")
                    : "  No reviews yet.";
                return {
                    content: [
                        {
                            type: "text",
                            text: `**${profile.name}**\n` +
                                `Location: ${profile.location}\n` +
                                `Rating: ${profile.rating}/5 (${profile.reviewCount} reviews)\n` +
                                `Starting at: $${profile.price}/${profile.priceUnit}\n` +
                                (profile.responseRate ? `Response rate: ${profile.responseRate}\n` : "") +
                                (profile.responseTime ? `Response time: ${profile.responseTime}\n` : "") +
                                (profile.fullBio ? `\nAbout: ${profile.fullBio}\n` : "") +
                                `\nRecent Reviews:\n${reviewsText}`,
                        },
                    ],
                };
            }
            case "search_services": {
                const { location } = SearchServicesSchema.parse(args);
                const services = await browser.searchServices(location);
                const formatted = services
                    .map((s) => `• **${s.type.replace(/_/g, " ")}**: ${s.description}`)
                    .join("\n");
                return {
                    content: [
                        {
                            type: "text",
                            text: `Available Rover services in ${location}:\n\n${formatted}`,
                        },
                    ],
                };
            }
            case "request_booking": {
                const params = RequestBookingSchema.parse(args);
                const result = await browser.requestBooking(params);
                return {
                    content: [
                        {
                            type: "text",
                            text: result.success
                                ? `Booking request sent! ${result.message}${result.bookingId ? ` Booking ID: ${result.bookingId}` : ""}`
                                : `Failed to send booking request: ${result.message}`,
                        },
                    ],
                };
            }
            case "get_bookings": {
                const bookings = await browser.getBookings();
                if (bookings.length === 0) {
                    return { content: [{ type: "text", text: "No bookings found." }] };
                }
                const formatted = bookings
                    .map((b) => `**Booking ${b.id}**\n` +
                    `  Sitter: ${b.sitterName}\n` +
                    `  Service: ${b.serviceType.replace(/_/g, " ")}\n` +
                    `  Dates: ${b.startDate} – ${b.endDate}\n` +
                    `  Status: ${b.status}\n` +
                    `  Total: $${b.totalPrice}`)
                    .join("\n\n");
                return { content: [{ type: "text", text: formatted }] };
            }
            case "message_sitter": {
                const { sitterId, message } = MessageSitterSchema.parse(args);
                const result = await browser.messageSitter(sitterId, message);
                return {
                    content: [
                        {
                            type: "text",
                            text: result.success
                                ? "Message sent successfully!"
                                : "Failed to send message. Please try again.",
                        },
                    ],
                };
            }
            case "get_messages": {
                const { sitterId } = GetMessagesSchema.parse(args);
                const messages = await browser.getMessages(sitterId);
                if (messages.length === 0) {
                    return { content: [{ type: "text", text: "No messages found." }] };
                }
                const formatted = messages
                    .map((m) => `**${m.senderName}** (${m.timestamp})${m.isRead ? "" : " [UNREAD]"}:\n  ${m.text}`)
                    .join("\n\n");
                return { content: [{ type: "text", text: formatted }] };
            }
            case "add_pet_profile": {
                const petData = AddPetSchema.parse(args);
                const result = await browser.addPetProfile(petData);
                return {
                    content: [
                        {
                            type: "text",
                            text: result.success
                                ? `Pet profile for ${petData.name} created successfully!${result.petId ? ` Pet ID: ${result.petId}` : ""}`
                                : "Failed to create pet profile. Please try again.",
                        },
                    ],
                };
            }
            case "update_pet_profile": {
                const { petId, ...updates } = UpdatePetSchema.parse(args);
                const result = await browser.updatePetProfile(petId, updates);
                return {
                    content: [
                        {
                            type: "text",
                            text: result.success
                                ? `Pet profile ${petId} updated successfully!`
                                : "Failed to update pet profile. Please try again.",
                        },
                    ],
                };
            }
            case "get_pets": {
                const pets = await browser.getPets();
                if (pets.length === 0) {
                    return {
                        content: [{ type: "text", text: "No pets found on your account." }],
                    };
                }
                const formatted = pets
                    .map((p) => `**${p.name}** (ID: ${p.id})\n` +
                    `  Species: ${p.species}` +
                    (p.breed ? `, Breed: ${p.breed}` : "") +
                    (p.age !== undefined ? `, Age: ${p.age} years` : "") +
                    (p.weight !== undefined ? `, Weight: ${p.weight} lbs` : "") +
                    (p.size ? `, Size: ${p.size}` : "") +
                    (p.specialNeeds ? `\n  Special needs: ${p.specialNeeds}` : ""))
                    .join("\n\n");
                return { content: [{ type: "text", text: formatted }] };
            }
            case "leave_review": {
                const { bookingId, rating, reviewText } = LeaveReviewSchema.parse(args);
                const result = await browser.leaveReview(bookingId, rating, reviewText);
                return {
                    content: [
                        {
                            type: "text",
                            text: result.success
                                ? `Review submitted successfully! You gave ${rating}/5 stars.`
                                : "Failed to submit review. The booking may not be eligible for review yet.",
                        },
                    ],
                };
            }
            case "get_favorites": {
                const favorites = await browser.getFavorites();
                if (favorites.length === 0) {
                    return { content: [{ type: "text", text: "No favorited sitters found." }] };
                }
                const formatted = favorites
                    .map((s, i) => `${i + 1}. **${s.name}** — ${s.location}\n` +
                    `   Rating: ${s.rating}/5\n` +
                    `   From $${s.price}/${s.priceUnit}\n` +
                    `   Profile: ${s.profileUrl}`)
                    .join("\n\n");
                return {
                    content: [{ type: "text", text: `Your favorited sitters:\n\n${formatted}` }],
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
// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown() {
    if (browserInitialized) {
        await browser.close();
    }
    process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// ── Start server ──────────────────────────────────────────────────────────────
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("@striderlabs/mcp-rover server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map