/**
 * Persuasion-Max Response Generator for Rover Conversations
 * ==========================================================
 * Multi-stage conversation engine. Each reply is a step in a
 * trajectory through 7-dimensional appraisal space (Smith & Ellsworth 1985).
 *
 * Stages map to the Persuasion-Max sequence analyzer:
 *   Stage 1: FIRST CONTACT  — pace anxiety, personalize, foot-in-the-door
 *   Stage 2: RAPPORT BUILD  — make them feel good, validate their standards
 *   Stage 3: COMMITMENT     — answer questions, deepen investment
 *   Stage 4: PRICING PLAY   — strategic discount framing (reciprocity + loss inversion)
 *   Stage 5: CLOSE          — collapse decision timeline, high agency
 *
 * Technique stack (all stealth-first, ≤2 visible):
 *   - Presupposition (95/100, very low awareness)
 *   - Authority via specificity (not credentials)
 *   - Third-party delivery for social proof
 *   - Reciprocity (gift after trust, not before)
 *   - Loss framing inversion (remove the fear, don't create it)
 *   - Foot-in-the-door (progressive micro-commitments)
 *   - Future pacing (reader simulates being your client)
 */
import { ThreadMessage } from "./browser.js";
export type ConversationStage = "first_contact" | "rapport_build" | "commitment" | "pricing_play" | "close";
export interface OwnerContext {
    ownerName: string;
    petNames: string[];
    petType: "cat" | "dog" | "other";
    dates?: string;
    duration?: string;
    isLongTerm: boolean;
    isMultiPet: boolean;
    concerns: string[];
    questionsAsked: string[];
    mentionedPrice: boolean;
    mentionedOtherSitters: boolean;
    messageCount: number;
    stage: ConversationStage;
}
/** Extract owner context from conversation history. */
export declare function analyzeConversation(messages: ThreadMessage[], ownerName: string): OwnerContext;
/**
 * Build the system prompt for the LLM that generates the reply.
 * This is the core Persuasion-Max integration point.
 */
export declare function buildSystemPrompt(ctx: OwnerContext): string;
/**
 * Build the user prompt (the owner's latest message + conversation context).
 */
export declare function buildUserPrompt(messages: ThreadMessage[], ctx: OwnerContext): string;
export interface PricingStrategy {
    shouldOffer: boolean;
    originalRate: number;
    offeredRate: number;
    framing: string;
}
/**
 * Determine if and how to offer a pricing adjustment.
 * Based on conversation context, not arbitrary discounts.
 */
export declare function calculatePricing(ctx: OwnerContext, baseRate?: number): PricingStrategy;
//# sourceMappingURL=responder.d.ts.map