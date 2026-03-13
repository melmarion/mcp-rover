export interface RoverSession {
    isLoggedIn: boolean;
    userId?: string;
    email?: string;
}
export interface SitterSearchParams {
    location: string;
    serviceType: "boarding" | "house_sitting" | "drop_in" | "doggy_day_care" | "dog_walking";
    startDate?: string;
    endDate?: string;
    petCount?: number;
    petSize?: "small" | "medium" | "large" | "giant";
}
export interface SitterResult {
    id: string;
    name: string;
    location: string;
    rating: number;
    reviewCount: number;
    price: number;
    priceUnit: string;
    services: string[];
    profileUrl: string;
    avatarUrl?: string;
    repeatClientCount?: number;
    yearsExperience?: number;
    summary?: string;
}
export interface SitterProfile extends SitterResult {
    fullBio?: string;
    reviews: Review[];
    certifications: string[];
    homeInfo?: string;
    acceptedPetTypes: string[];
    acceptedPetSizes: string[];
    responseRate?: string;
    responseTime?: string;
}
export interface Review {
    authorName: string;
    rating: number;
    date: string;
    text: string;
    petName?: string;
    serviceType?: string;
}
export interface BookingRequest {
    sitterId: string;
    serviceType: string;
    startDate: string;
    endDate: string;
    petIds: string[];
    message?: string;
}
export interface Booking {
    id: string;
    sitterName: string;
    sitterId: string;
    serviceType: string;
    startDate: string;
    endDate: string;
    status: "pending" | "confirmed" | "completed" | "cancelled";
    totalPrice: number;
    pets: string[];
}
export interface Message {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: string;
    isRead: boolean;
}
export interface Pet {
    id: string;
    name: string;
    species: "dog" | "cat" | "other";
    breed?: string;
    age?: number;
    weight?: number;
    size?: "small" | "medium" | "large" | "giant";
    temperament?: string;
    specialNeeds?: string;
    vaccinated?: boolean;
    spayedNeutered?: boolean;
    profilePhotoUrl?: string;
}
export declare class RoverBrowser {
    private browser;
    private context;
    private page;
    private session;
    private readonly BASE_URL;
    initialize(headless?: boolean): Promise<void>;
    close(): Promise<void>;
    private ensurePage;
    login(email: string, password: string): Promise<RoverSession>;
    searchSitters(params: SitterSearchParams): Promise<SitterResult[]>;
    getSitterProfile(profileUrlOrId: string): Promise<SitterProfile>;
    searchServices(location: string): Promise<Array<{
        type: string;
        description: string;
        availableCount: number;
    }>>;
    requestBooking(request: BookingRequest): Promise<{
        success: boolean;
        bookingId?: string;
        message: string;
    }>;
    getBookings(): Promise<Booking[]>;
    messageSitter(sitterId: string, message: string): Promise<{
        success: boolean;
        messageId?: string;
    }>;
    getMessages(sitterId?: string): Promise<Message[]>;
    addPetProfile(pet: Omit<Pet, "id">): Promise<{
        success: boolean;
        petId?: string;
    }>;
    updatePetProfile(petId: string, updates: Partial<Pet>): Promise<{
        success: boolean;
    }>;
    getPets(): Promise<Pet[]>;
    leaveReview(bookingId: string, rating: number, text: string): Promise<{
        success: boolean;
    }>;
    getFavorites(): Promise<SitterResult[]>;
    getSession(): RoverSession;
}
//# sourceMappingURL=browser.d.ts.map