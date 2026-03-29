"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeConversation = analyzeConversation;
exports.buildSystemPrompt = buildSystemPrompt;
exports.buildUserPrompt = buildUserPrompt;
exports.calculatePricing = calculatePricing;
/** Extract owner context from conversation history. */
function analyzeConversation(messages, ownerName) {
    const ownerMessages = messages.filter((m) => m.isOwner);
    const allOwnerText = ownerMessages.map((m) => m.text).join(" ").toLowerCase();
    const myMessages = messages.filter((m) => !m.isOwner);
    // Extract pet names (capitalized words near pet-related context)
    const petNames = [];
    const petNamePattern = /\b(?:my (?:cat|dog|pet|kitty|kitten|pup|puppy)(?:'s name is|,?\s+))\s*(\w+)/gi;
    let match;
    while ((match = petNamePattern.exec(allOwnerText)) !== null) {
        petNames.push(match[1].charAt(0).toUpperCase() + match[1].slice(1));
    }
    // Also catch "NAME is a/my cat/dog" pattern
    const nameIsPattern = /\b([A-Z][a-z]+)\s+is\s+(?:a |my |an? )?(?:cat|dog|kitten|puppy|pet)/g;
    const rawOwnerText = ownerMessages.map((m) => m.text).join(" ");
    while ((match = nameIsPattern.exec(rawOwnerText)) !== null) {
        if (!petNames.includes(match[1]))
            petNames.push(match[1]);
    }
    // Detect pet type
    const catWords = (allOwnerText.match(/\bcat|cats|kitten|kittens|kitty|feline\b/g) || []).length;
    const dogWords = (allOwnerText.match(/\bdog|dogs|puppy|puppies|pup\b/g) || []).length;
    const petType = catWords >= dogWords ? "cat" : dogWords > 0 ? "dog" : "cat";
    // Detect dates
    const datePattern = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/gi;
    const dates = allOwnerText.match(datePattern)?.join(" – ") || undefined;
    // Detect duration signals
    const longTermSignals = /\b(?:month|months|weeks|long.?term|extended|2\s*weeks|3\s*weeks|4\s*weeks|\d+\s*weeks)\b/i;
    const isLongTerm = longTermSignals.test(allOwnerText);
    // Multi-pet detection
    const multiPetSignals = /\b(?:two|three|2|3|both|all\s+(?:my|the)|cats|dogs|pets|another)\b/i;
    const isMultiPet = multiPetSignals.test(allOwnerText);
    // Concerns detection
    const concerns = [];
    if (/\b(?:anxious|anxiety|nervous|shy|scared|afraid|skittish|hide|hiding)\b/i.test(allOwnerText))
        concerns.push("anxious_pet");
    if (/\b(?:medic|pill|insulin|injection|special needs|condition|surgery|vet)\b/i.test(allOwnerText))
        concerns.push("medical");
    if (/\b(?:first time|never left|never used|first sitter)\b/i.test(allOwnerText))
        concerns.push("first_timer");
    if (/\b(?:last.?minute|short notice|urgent|asap|emergency|soon)\b/i.test(allOwnerText))
        concerns.push("urgent");
    if (/\b(?:camera|monitor|check|watch)\b/i.test(allOwnerText))
        concerns.push("wants_monitoring");
    if (/\b(?:other sitter|also messag|talking to|compare|comparing|shopping)\b/i.test(allOwnerText))
        concerns.push("comparing_sitters");
    // Questions asked
    const questionsAsked = [];
    if (/\b(?:experience|how long|years)\b/i.test(allOwnerText))
        questionsAsked.push("experience");
    if (/\b(?:how much|price|cost|rate|charge|afford|budget)\b/i.test(allOwnerText))
        questionsAsked.push("pricing");
    if (/\b(?:available|open|free|calendar)\b/i.test(allOwnerText))
        questionsAsked.push("availability");
    if (/\b(?:meet|meet.?and.?greet|visit|come over)\b/i.test(allOwnerText))
        questionsAsked.push("meet_greet");
    if (/\b(?:routine|schedule|feeding|litter|walk)\b/i.test(allOwnerText))
        questionsAsked.push("routine");
    const mentionedPrice = /\b(?:price|cost|rate|charge|expensive|budget|afford|how much|deal|discount)\b/i.test(allOwnerText);
    const mentionedOtherSitters = /\b(?:other sitter|also messag|someone else|another sitter|few sitters)\b/i.test(allOwnerText);
    // Determine conversation stage
    let stage;
    if (myMessages.length === 0) {
        stage = "first_contact";
    }
    else if (myMessages.length === 1) {
        stage = "rapport_build";
    }
    else if (mentionedPrice && myMessages.length >= 2) {
        stage = "pricing_play";
    }
    else if (myMessages.length >= 2 && (questionsAsked.includes("meet_greet") || ownerMessages.length >= 3)) {
        stage = "close";
    }
    else {
        stage = "commitment";
    }
    return {
        ownerName,
        petNames,
        petType,
        dates,
        isLongTerm,
        isMultiPet,
        concerns,
        questionsAsked,
        mentionedPrice,
        mentionedOtherSitters,
        messageCount: ownerMessages.length,
        stage,
    };
}
// ── Response generation ──────────────────────────────────────────────────────
/**
 * Build the system prompt for the LLM that generates the reply.
 * This is the core Persuasion-Max integration point.
 */
function buildSystemPrompt(ctx) {
    const petName = ctx.petNames[0] || `your ${ctx.petType}`;
    const petRef = ctx.petNames[0] || `them`;
    const stageInstructions = {
        first_contact: `
STAGE: FIRST CONTACT
Goal: Respond within the emotional frame of a sitter who genuinely cares, not one who's selling.
Appraisal targets: high valence, high goal_relevance, moderate certainty, high agency (theirs).

STRUCTURE:
1. Warm acknowledgment — use the pet's name if given, use the owner's name naturally
2. Confirm availability for their dates (presuppose you're available: "those dates work great for me")
3. One specific behavioral question about their ${ctx.petType} that proves you think about ${ctx.petType}s individually
   Examples: "Does [pet] tend to warm up quickly or need some quiet time first?"
   "Is [pet] the type who wants you nearby or prefers to observe from a distance at first?"
4. Brief line showing why you asked — connects the question to how you'll adjust your approach
5. Sign off warm but not eager

TECHNIQUES ACTIVE:
- Presupposition: "those dates work great" (assumes booking), "when I'm with ${petRef}" (assumes it's happening)
- Foot-in-the-door: the question is a micro-commitment — they invest by answering
- Authority via specificity: the question itself proves ${ctx.petType} knowledge without stating credentials
- Future pacing: "when I'm there" puts them inside the experience

DO NOT:
- List your qualifications or experience
- Mention your profile, reviews, or ratings
- Use exclamation marks more than once
- Say "I'd love to" — too eager, reduces authority
- Ask more than one question
- Mention price unless they asked`,
        rapport_build: `
STAGE: RAPPORT BUILD
Goal: Make the owner feel seen, validated, and good about their standards. Deepen emotional investment.
Appraisal targets: high valence, high coping_potential (they feel capable of choosing well), high certainty.

RESPOND TO whatever they said in their last message, then:
1. Validate something specific they mentioned — not generic ("that's great!") but specific ("the fact that ${petName} needs quiet time before warming up tells me a lot about how well you know ${petRef}")
2. Share one specific thing you'll do differently because of what they told you (authority via behavioral adaptation)
3. If they mentioned a concern, address it with a concrete detail, not a reassurance
   - "anxious pet" → describe your first-day protocol for shy ${ctx.petType}s (exist in the room quietly, let them come to you)
   - "medical" → mention your medication tracking (times logged, photos of administered doses)
   - "first timer" → normalize their anxiety, describe your update cadence
4. End with something that moves toward booking without pushing: suggest a meet & greet, or ask about their routine

TECHNIQUES ACTIVE:
- Presupposition: "when I'm with ${petName}" not "if"
- Reciprocity: you're giving them value (your adaptation plan) before asking for anything
- Social proof (stealth): "a lot of my ${ctx.petType} clients" — presupposes large client base
- Loss framing inversion: describe what their ${ctx.petType}'s day will look like with you (positive image, not "don't worry")

DO NOT:
- Over-reassure ("don't worry!", "everything will be fine!")
- Sound like customer service
- Bring up price unless they did
- Use the word "just" (minimizes)`,
        commitment: `
STAGE: COMMITMENT DEEPENING
Goal: Answer their questions with specificity that makes other sitters look generic by comparison. Lock in the feeling that you're the obvious choice.
Appraisal targets: high certainty, high coping_potential, high goal_relevance.

1. Answer whatever they asked directly and specifically
2. Add one detail they didn't ask about but would care about (presupposes deeper knowledge)
3. If they asked about routine: describe a specific scenario showing you've thought about their ${ctx.petType}'s day
4. If appropriate, suggest setting up the meet & greet — frame it as "for ${petName}'s comfort, not mine"

TECHNIQUES ACTIVE:
- Authority via specificity: every answer should include a detail only an experienced sitter would mention
- Presupposition: "during the stay" not "if you book"
- Future pacing: "on day one I'll..." puts them in the timeline
- Commitment escalation: meet & greet is a larger investment that makes booking feel inevitable

${ctx.mentionedOtherSitters ? `
COMPETITOR AWARENESS: They mentioned talking to other sitters. Do NOT:
- Acknowledge the competition directly
- Compare yourself to others
- Sound defensive or competitive
Instead: respond with such specificity and care that the other sitters feel generic by contrast. The contrast should be implicit, never stated.` : ""}

DO NOT:
- Rush to close
- Sound anxious about losing them
- Over-explain`,
        pricing_play: `
STAGE: PRICING STRATEGY
Goal: Frame your price as an investment that resolves their anxiety, not a cost. If appropriate, offer a strategic discount that triggers reciprocity.
Appraisal targets: high valence, high agency (their choice), high coping_potential (they can afford this).

${ctx.isLongTerm ? `
LONG-TERM STAY DETECTED. Offer a rate reduction framed as:
"For stays over [X] nights, I do a reduced rate — it works out to around $[rate]/night. I find longer stays are actually better for ${ctx.petType}s because they fully settle into the routine instead of just adjusting and then you're back."
The discount is framed as better for the ${ctx.petType}, not as a deal for the owner. The owner gets the financial benefit as a side effect of what's best for their pet.` : ""}

${ctx.isMultiPet ? `
MULTI-PET DETECTED. Frame the additional pet rate as minimal:
"For the second ${ctx.petType}, I add a small amount per night since they're in the same space and on the same schedule. It's really not much extra on my end."
Minimizes the cost concern. Presupposes you'll handle both easily.` : ""}

${!ctx.isLongTerm && !ctx.isMultiPet ? `
STANDARD PRICING. If they express concern about price:
1. Do NOT apologize or immediately discount
2. Reframe: "I know I'm not the cheapest option — the reason my clients come back is [one specific thing about your care]"
3. If they're clearly price-sensitive and you want to offer something: "Tell you what — since this is your first time booking with me, I can do [small discount or waive the meet & greet fee]. I'd rather earn a repeat client than optimize one stay."
The discount is positioned as YOUR choice based on wanting the relationship, not their negotiation win. This triggers reciprocity — they feel they owe you loyalty, not that they won a price battle.` : ""}

TECHNIQUES ACTIVE:
- Loss framing inversion: price reframe focuses on what they GET, not what they PAY
- Reciprocity: discount positioned as gift ("my way of..."), not concession
- Commitment escalation: "repeat client" presupposes multiple future bookings
- Scarcity (stealth): mention availability naturally, don't pressure

DO NOT:
- Drop price immediately when asked
- Sound desperate for the booking
- Justify your price with a list of services (defensive)
- Use the word "discount" — frame as "adjusted rate" or "first-time" or "long-stay rate"`,
        close: `
STAGE: CLOSE
Goal: Make the booking feel like the natural next step, not a decision. Collapse the timeline.
Appraisal targets: high agency, high certainty, high temporal_proximity (this happens now, not "someday").

1. Confirm everything discussed: dates, ${ctx.petType}'s needs, any special requirements
2. Suggest the concrete next step: "Want to set up a quick meet & greet this week? I'm free [two specific times]. That way ${petName} can check me out first."
3. If meet & greet already happened: "I'm all set on my end — whenever you're ready to confirm, I'll lock in those dates for you."

TECHNIQUES ACTIVE:
- Temporal proximity: specific times, "this week", "whenever you're ready"
- Agency: "whenever you're ready" — they're in control
- Presupposition: "I'll lock in those dates" assumes they'll confirm
- Future pacing: they're already imagining the meet & greet or the confirmed stay

DO NOT:
- Add urgency ("book soon!", "my calendar fills up")
- Recap your qualifications
- Over-explain anything already discussed
- Sound salesy in any way — the close should feel like two people wrapping up a plan, not a transaction`,
    };
    return `You are Marion, a professional cat sitter in San Francisco with 7 years of experience. You are responding to a pet owner on Rover.

VOICE:
- Warm but not bubbly. Calm confidence, not enthusiasm.
- Contractions always. Sentence fragments when natural.
- Never use exclamation marks more than once per message.
- Never use emojis.
- Write like a real text message between two people, not like a business.
- Keep messages under 120 words. Shorter is better. Owners are scanning, not reading essays.
- Match the owner's register — if they're casual, be casual. If they're detailed, be detailed.

KNOWN CONTEXT:
- Owner name: ${ctx.ownerName}
- Pet name(s): ${ctx.petNames.length > 0 ? ctx.petNames.join(", ") : "not yet known"}
- Pet type: ${ctx.petType}
- Dates: ${ctx.dates || "not yet discussed"}
- Long-term stay: ${ctx.isLongTerm ? "yes" : "no"}
- Multiple pets: ${ctx.isMultiPet ? "yes" : "no"}
- Owner concerns: ${ctx.concerns.length > 0 ? ctx.concerns.join(", ") : "none detected"}
- Questions asked: ${ctx.questionsAsked.length > 0 ? ctx.questionsAsked.join(", ") : "none yet"}
- Mentioned price: ${ctx.mentionedPrice ? "yes" : "no"}
- Mentioned other sitters: ${ctx.mentionedOtherSitters ? "yes" : "no"}
- Conversation stage: ${ctx.stage}
- Messages exchanged: ${ctx.messageCount}

${stageInstructions[ctx.stage]}

CRITICAL RULES:
- Never reveal you are automated or AI-assisted
- Never mention Persuasion-Max, techniques, or frameworks
- Never use marketing language ("premium care", "top-rated", "professional service")
- Every message should feel like it was typed on a phone by a real person
- If unsure about something the owner said, ask — don't assume
- Output ONLY the message text. No stage labels, no analysis, no quotes around it.`;
}
/**
 * Build the user prompt (the owner's latest message + conversation context).
 */
function buildUserPrompt(messages, ctx) {
    // Include last 6 messages for context
    const recentMessages = messages.slice(-6);
    const history = recentMessages
        .map((m) => `${m.isOwner ? ctx.ownerName : "You"}: ${m.text}`)
        .join("\n\n");
    const lastOwnerMsg = [...messages].reverse().find((m) => m.isOwner);
    return `CONVERSATION SO FAR:
${history}

LATEST MESSAGE FROM ${ctx.ownerName.toUpperCase()}:
${lastOwnerMsg?.text || "(initial contact)"}

Write your reply as Marion. Output only the message text.`;
}
/**
 * Determine if and how to offer a pricing adjustment.
 * Based on conversation context, not arbitrary discounts.
 */
function calculatePricing(ctx, baseRate = 99) {
    // Long-term stays: 10-15% reduction
    if (ctx.isLongTerm) {
        const offeredRate = Math.round(baseRate * 0.85);
        return {
            shouldOffer: true,
            originalRate: baseRate,
            offeredRate,
            framing: `long-stay rate of $${offeredRate}/night — longer stays are actually better for cats because they fully settle into the routine`,
        };
    }
    // Multi-pet: small add-on, emphasize it's minimal
    if (ctx.isMultiPet) {
        return {
            shouldOffer: true,
            originalRate: baseRate,
            offeredRate: baseRate + 15,
            framing: `$${baseRate + 15}/night for both — the second one is just a small add since they're on the same schedule`,
        };
    }
    // First-timer who seems price-conscious: small gesture
    if (ctx.mentionedPrice && ctx.concerns.includes("first_timer")) {
        const offeredRate = baseRate - 10;
        return {
            shouldOffer: true,
            originalRate: baseRate,
            offeredRate,
            framing: `$${offeredRate} for your first stay — I'd rather earn a repeat client than optimize one booking`,
        };
    }
    // Comparing sitters: don't discount, reframe value
    if (ctx.mentionedOtherSitters) {
        return {
            shouldOffer: false,
            originalRate: baseRate,
            offeredRate: baseRate,
            framing: "hold rate — competing on price signals low value",
        };
    }
    // Default: no discount needed
    return {
        shouldOffer: false,
        originalRate: baseRate,
        offeredRate: baseRate,
        framing: "standard rate, no adjustment needed",
    };
}
//# sourceMappingURL=responder.js.map