/**
 * Persuasion-Max Response Generator for Rover Conversations
 * ==========================================================
 * Multi-stage conversation engine. Each reply is a step in a
 * trajectory through 7-dimensional appraisal space (Smith & Ellsworth 1985).
 *
 * Core principle: whatever the owner is worried about, that's the thing
 * you love about their cat. Every trait is the fun part, not a problem
 * you'll tolerate. This is the emotional separation no autobook and no
 * generic "I can handle it" response can compete with.
 *
 * Stages:
 *   Stage 1: FIRST CONTACT  — confirm dates, one sticky question, presuppose booking
 *   Stage 2: RAPPORT BUILD  — mirror their detail with warmth/humor, soothe concerns by loving the trait
 *   Stage 3: COMMITMENT     — specificity that makes other sitters look generic
 *   Stage 4: PRICING PLAY   — strategic discount framing, status flip ("I'll let you know if it's a good fit")
 *   Stage 5: CLOSE          — "those dates are held for you" — reciprocity + soft scarcity
 *
 * Technique stack (all stealth-first, ≤2 visible):
 *   - Presupposition (95/100, very low awareness)
 *   - Authority via specificity (not credentials)
 *   - Concern-to-compliment reframe (owner's worry becomes evidence of good ownership)
 *   - Problem-to-preference reframe (cat's "issue" becomes the thing you enjoy)
 *   - Reciprocity (hold dates as gift, discount as relationship investment)
 *   - Status flip ("I'll let you know if it's a good fit")
 *   - Foot-in-the-door (progressive micro-commitments via questions)
 *
 * No meet & greets. Marion is not in town. Reframe as method, not limitation.
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
    mentionedMeetGreet: boolean;
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