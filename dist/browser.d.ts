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
export interface OwnerPetProfile {
    ownerName: string;
    pets: PetDetail[];
    location?: string;
    memberSince?: string;
    profileUrl: string;
}
export interface PetDetail {
    name: string;
    species: string;
    breed?: string;
    age?: string;
    weight?: string;
    size?: string;
    temperament?: string;
    specialNeeds?: string;
    spayedNeutered?: boolean;
    vaccinated?: boolean;
    photoUrl?: string;
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
export declare class RoverBrowser {
    private browser;
    private context;
    private page;
    private session;
    private readonly BASE_URL;
    private knownThreadIds;
    private lastPollTime;
    /**
     * Launch browser with stealth configuration.
     * Mirrors LinkedIn anti-detection: real fingerprint, no webdriver leak,
     * cookie persistence, randomized viewport.
     */
    initialize(headless?: boolean): Promise<void>;
    close(): Promise<void>;
    private ensurePage;
    private ensureLoggedIn;
    login(email: string, password: string): Promise<RoverSession>;
    getInboxThreads(): Promise<InboxThread[]>;
    getThreadMessages(threadUrl: string): Promise<ThreadMessage[]>;
    pollInbox(): Promise<InboxPollResult>;
    replyToThread(threadUrl: string, message: string): Promise<{
        success: boolean;
    }>;
    getSitterStats(): Promise<SitterStats>;
    /**
     * Scrape the owner's pet profile from their Rover account.
     * Called from the message thread — Rover shows a link to the owner's
     * profile with their pet details (name, breed, age, temperament, etc).
     *
     * This is the key advantage over autobook: we know the cat's name and
     * details before the owner even mentions them.
     */
    getOwnerPetProfile(threadUrl: string): Promise<OwnerPetProfile | null>;
    private humanScroll;
    getSession(): RoverSession;
    getNextPollInterval(): number;
}
//# sourceMappingURL=browser.d.ts.map