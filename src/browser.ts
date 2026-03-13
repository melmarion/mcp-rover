import { Browser, BrowserContext, Page, chromium } from "playwright";

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

export class RoverBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private session: RoverSession = { isLoggedIn: false };
  private readonly BASE_URL = "https://www.rover.com";

  async initialize(headless: boolean = true): Promise<void> {
    this.browser = await chromium.launch({
      headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });
    this.page = await this.context.newPage();
  }

  async close(): Promise<void> {
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

  async login(email: string, password: string): Promise<RoverSession> {
    const page = this.ensurePage();
    await page.goto(`${this.BASE_URL}/login/`);
    await page.waitForLoadState("networkidle");

    await page.fill('input[name="email"], input[type="email"]', email);
    await page.fill('input[name="password"], input[type="password"]', password);
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForLoadState("networkidle");

    const url = page.url();
    const loggedIn =
      !url.includes("/login") &&
      !url.includes("/signin") &&
      (url.includes("/dashboard") ||
        url.includes("/account") ||
        url === `${this.BASE_URL}/` ||
        !url.includes("login"));

    this.session = {
      isLoggedIn: loggedIn,
      email: loggedIn ? email : undefined,
    };

    return this.session;
  }

  async searchSitters(params: SitterSearchParams): Promise<SitterResult[]> {
    const page = this.ensurePage();
    const serviceMap: Record<string, string> = {
      boarding: "boarding",
      house_sitting: "house-sitting",
      drop_in: "drop-in-visits",
      doggy_day_care: "doggy-day-care",
      dog_walking: "dog-walking",
    };
    const service = serviceMap[params.serviceType] || "boarding";
    const encodedLocation = encodeURIComponent(params.location);
    let url = `${this.BASE_URL}/search/results/?service_type=${service}&location=${encodedLocation}`;

    if (params.startDate) url += `&start_date=${params.startDate}`;
    if (params.endDate) url += `&end_date=${params.endDate}`;
    if (params.petCount) url += `&dog_count=${params.petCount}`;

    await page.goto(url);
    await page.waitForLoadState("networkidle");

    const sitters = await page.evaluate(() => {
      const results: Array<{
        id: string;
        name: string;
        location: string;
        rating: number;
        reviewCount: number;
        price: number;
        priceUnit: string;
        services: string[];
        profileUrl: string;
        avatarUrl: string | undefined;
        summary: string | undefined;
      }> = [];

      const cards = document.querySelectorAll(
        '[data-testid="sitter-card"], .sitter-card, article[class*="sitter"], [class*="SearchResult"]'
      );

      cards.forEach((card, index) => {
        if (index >= 20) return;
        const nameEl = card.querySelector(
          '[class*="sitter-name"], [class*="SitterName"], h3, h2'
        );
        const ratingEl = card.querySelector(
          '[class*="rating"], [aria-label*="rating"], [class*="Rating"]'
        );
        const reviewEl = card.querySelector('[class*="review"], [class*="Review"]');
        const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
        const locationEl = card.querySelector('[class*="location"], [class*="Location"]');
        const linkEl = card.querySelector("a[href*='/sitters/'], a[href*='/dog-boarding/']");
        const imgEl = card.querySelector("img");
        const summaryEl = card.querySelector('[class*="summary"], [class*="Summary"], p');

        const ratingText = ratingEl?.textContent?.trim() || "0";
        const reviewText = reviewEl?.textContent?.replace(/[^\d]/g, "") || "0";
        const priceText = priceEl?.textContent?.replace(/[^\d.]/g, "") || "0";

        if (nameEl?.textContent?.trim()) {
          results.push({
            id: `sitter-${index}`,
            name: nameEl.textContent.trim(),
            location: locationEl?.textContent?.trim() || "",
            rating: parseFloat(ratingText) || 0,
            reviewCount: parseInt(reviewText, 10) || 0,
            price: parseFloat(priceText) || 0,
            priceUnit: "night",
            services: [],
            profileUrl: (linkEl as HTMLAnchorElement)?.href || "",
            avatarUrl: (imgEl as HTMLImageElement)?.src,
            summary: summaryEl?.textContent?.trim(),
          });
        }
      });

      return results;
    });

    return sitters.map((s, i) => ({
      ...s,
      id: s.id || `sitter-${i}`,
    }));
  }

  async getSitterProfile(profileUrlOrId: string): Promise<SitterProfile> {
    const page = this.ensurePage();
    const url = profileUrlOrId.startsWith("http")
      ? profileUrlOrId
      : `${this.BASE_URL}/sitters/${profileUrlOrId}/`;

    await page.goto(url);
    await page.waitForLoadState("networkidle");

    const profile = await page.evaluate(() => {
      const nameEl = document.querySelector(
        'h1[class*="name"], [class*="sitter-name"], h1'
      );
      const ratingEl = document.querySelector('[class*="rating"], [aria-label*="rating"]');
      const reviewCountEl = document.querySelector('[class*="review-count"], [class*="ReviewCount"]');
      const locationEl = document.querySelector('[class*="location"], address');
      const bioEl = document.querySelector('[class*="bio"], [class*="Bio"], [class*="about"]');
      const priceEl = document.querySelector('[class*="price"], [class*="Price"]');
      const responseRateEl = document.querySelector('[class*="response-rate"]');
      const responseTimeEl = document.querySelector('[class*="response-time"]');

      const reviewEls = document.querySelectorAll(
        '[class*="review-item"], [class*="ReviewItem"], [class*="review"]'
      );
      const reviews: Array<{
        authorName: string;
        rating: number;
        date: string;
        text: string;
      }> = [];
      reviewEls.forEach((el, i) => {
        if (i >= 10) return;
        const author = el.querySelector('[class*="author"], [class*="Author"]');
        const rating = el.querySelector('[class*="rating"], [class*="Rating"]');
        const date = el.querySelector('[class*="date"], time');
        const text = el.querySelector('[class*="text"], [class*="comment"], p');
        if (author?.textContent?.trim() || text?.textContent?.trim()) {
          reviews.push({
            authorName: author?.textContent?.trim() || "Anonymous",
            rating: parseFloat(rating?.textContent?.trim() || "5") || 5,
            date: date?.textContent?.trim() || (date as HTMLTimeElement)?.dateTime || "",
            text: text?.textContent?.trim() || "",
          });
        }
      });

      return {
        id: window.location.pathname.split("/").filter(Boolean).pop() || "",
        name: nameEl?.textContent?.trim() || "",
        location: locationEl?.textContent?.trim() || "",
        rating: parseFloat(ratingEl?.textContent?.trim() || "0") || 0,
        reviewCount: parseInt(reviewCountEl?.textContent?.replace(/[^\d]/g, "") || "0", 10) || 0,
        price: parseFloat(priceEl?.textContent?.replace(/[^\d.]/g, "") || "0") || 0,
        priceUnit: "night",
        services: [],
        profileUrl: window.location.href,
        fullBio: bioEl?.textContent?.trim(),
        reviews,
        certifications: [],
        acceptedPetTypes: ["dog"],
        acceptedPetSizes: [],
        responseRate: responseRateEl?.textContent?.trim(),
        responseTime: responseTimeEl?.textContent?.trim(),
      };
    });

    return profile;
  }

  async searchServices(location: string): Promise<Array<{ type: string; description: string; availableCount: number }>> {
    const page = this.ensurePage();
    await page.goto(`${this.BASE_URL}/`);
    await page.waitForLoadState("networkidle");

    return [
      { type: "boarding", description: "Your dog stays at the sitter's home", availableCount: 0 },
      { type: "house_sitting", description: "Sitter stays in your home", availableCount: 0 },
      { type: "drop_in", description: "Sitter visits your home for 30-60 minutes", availableCount: 0 },
      { type: "doggy_day_care", description: "Your dog spends the day at the sitter's home", availableCount: 0 },
      { type: "dog_walking", description: "Sitter takes your dog for a walk", availableCount: 0 },
    ];
  }

  async requestBooking(request: BookingRequest): Promise<{ success: boolean; bookingId?: string; message: string }> {
    if (!this.session.isLoggedIn) {
      return { success: false, message: "You must be logged in to request a booking." };
    }
    const page = this.ensurePage();
    const sitterUrl = request.sitterId.startsWith("http")
      ? request.sitterId
      : `${this.BASE_URL}/sitters/${request.sitterId}/`;

    await page.goto(sitterUrl);
    await page.waitForLoadState("networkidle");

    const requestBtn = page.locator(
      'button:has-text("Request"), a:has-text("Book"), button:has-text("Book")'
    ).first();
    if (await requestBtn.isVisible()) {
      await requestBtn.click();
      await page.waitForLoadState("networkidle");
    }

    const startInput = page.locator('input[name*="start"], input[placeholder*="start"]').first();
    if (await startInput.isVisible()) {
      await startInput.fill(request.startDate);
    }
    const endInput = page.locator('input[name*="end"], input[placeholder*="end"]').first();
    if (await endInput.isVisible()) {
      await endInput.fill(request.endDate);
    }

    if (request.message) {
      const msgInput = page.locator('textarea[name*="message"], textarea[placeholder*="message"]').first();
      if (await msgInput.isVisible()) {
        await msgInput.fill(request.message);
      }
    }

    return {
      success: true,
      message: "Booking request initiated. Please complete on Rover.com.",
    };
  }

  async getBookings(): Promise<Booking[]> {
    if (!this.session.isLoggedIn) {
      throw new Error("You must be logged in to view bookings.");
    }
    const page = this.ensurePage();
    await page.goto(`${this.BASE_URL}/dashboard/bookings/`);
    await page.waitForLoadState("networkidle");

    const bookings = await page.evaluate(() => {
      const items: Array<{
        id: string;
        sitterName: string;
        sitterId: string;
        serviceType: string;
        startDate: string;
        endDate: string;
        status: string;
        totalPrice: number;
        pets: string[];
      }> = [];

      const cards = document.querySelectorAll(
        '[class*="booking-card"], [class*="BookingCard"], [data-testid*="booking"]'
      );
      cards.forEach((card, i) => {
        const sitterEl = card.querySelector('[class*="sitter"], h3, h2');
        const datesEl = card.querySelector('[class*="dates"], [class*="Dates"]');
        const statusEl = card.querySelector('[class*="status"], [class*="Status"]');
        const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
        items.push({
          id: `booking-${i}`,
          sitterName: sitterEl?.textContent?.trim() || "",
          sitterId: "",
          serviceType: "boarding",
          startDate: datesEl?.textContent?.split("-")[0]?.trim() || "",
          endDate: datesEl?.textContent?.split("-")[1]?.trim() || "",
          status: (statusEl?.textContent?.trim() || "pending") as "pending",
          totalPrice: parseFloat(priceEl?.textContent?.replace(/[^\d.]/g, "") || "0") || 0,
          pets: [],
        });
      });
      return items;
    });

    return bookings as Booking[];
  }

  async messageSitter(
    sitterId: string,
    message: string
  ): Promise<{ success: boolean; messageId?: string }> {
    if (!this.session.isLoggedIn) {
      throw new Error("You must be logged in to send messages.");
    }
    const page = this.ensurePage();
    const sitterUrl = sitterId.startsWith("http")
      ? sitterId
      : `${this.BASE_URL}/sitters/${sitterId}/`;
    await page.goto(sitterUrl);
    await page.waitForLoadState("networkidle");

    const contactBtn = page.locator(
      'button:has-text("Contact"), button:has-text("Message"), a:has-text("Contact")'
    ).first();
    if (await contactBtn.isVisible()) {
      await contactBtn.click();
      await page.waitForLoadState("networkidle");
    }

    const textarea = page.locator("textarea").first();
    if (await textarea.isVisible()) {
      await textarea.fill(message);
      const sendBtn = page.locator('button[type="submit"], button:has-text("Send")').first();
      if (await sendBtn.isVisible()) {
        await sendBtn.click();
        await page.waitForLoadState("networkidle");
        return { success: true };
      }
    }

    return { success: false };
  }

  async getMessages(sitterId?: string): Promise<Message[]> {
    if (!this.session.isLoggedIn) {
      throw new Error("You must be logged in to view messages.");
    }
    const page = this.ensurePage();

    if (sitterId) {
      await page.goto(`${this.BASE_URL}/dashboard/messages/${sitterId}/`);
    } else {
      await page.goto(`${this.BASE_URL}/dashboard/messages/`);
    }
    await page.waitForLoadState("networkidle");

    const messages = await page.evaluate(() => {
      const items: Array<{
        id: string;
        senderId: string;
        senderName: string;
        text: string;
        timestamp: string;
        isRead: boolean;
      }> = [];

      const msgEls = document.querySelectorAll(
        '[class*="message-item"], [class*="MessageItem"], [class*="chat-message"]'
      );
      msgEls.forEach((el, i) => {
        const sender = el.querySelector('[class*="sender"], [class*="Sender"]');
        const text = el.querySelector('[class*="text"], [class*="body"], p');
        const time = el.querySelector('time, [class*="time"]');
        items.push({
          id: `msg-${i}`,
          senderId: "",
          senderName: sender?.textContent?.trim() || "",
          text: text?.textContent?.trim() || "",
          timestamp:
            (time as HTMLTimeElement)?.dateTime ||
            time?.textContent?.trim() ||
            "",
          isRead: !el.classList.toString().includes("unread"),
        });
      });
      return items;
    });

    return messages;
  }

  async addPetProfile(pet: Omit<Pet, "id">): Promise<{ success: boolean; petId?: string }> {
    if (!this.session.isLoggedIn) {
      throw new Error("You must be logged in to add a pet.");
    }
    const page = this.ensurePage();
    await page.goto(`${this.BASE_URL}/account/pets/new/`);
    await page.waitForLoadState("networkidle");

    const nameInput = page.locator('input[name="name"], input[placeholder*="name"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill(pet.name);
    }

    if (pet.breed) {
      const breedInput = page.locator('input[name="breed"]').first();
      if (await breedInput.isVisible()) await breedInput.fill(pet.breed);
    }

    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForLoadState("networkidle");
      return { success: true };
    }

    return { success: false };
  }

  async updatePetProfile(
    petId: string,
    updates: Partial<Pet>
  ): Promise<{ success: boolean }> {
    if (!this.session.isLoggedIn) {
      throw new Error("You must be logged in to update a pet profile.");
    }
    const page = this.ensurePage();
    await page.goto(`${this.BASE_URL}/account/pets/${petId}/edit/`);
    await page.waitForLoadState("networkidle");

    if (updates.name) {
      const nameInput = page.locator('input[name="name"]').first();
      if (await nameInput.isVisible()) await nameInput.fill(updates.name);
    }

    if (updates.specialNeeds) {
      const needsInput = page.locator('textarea[name*="special"], textarea[name*="needs"]').first();
      if (await needsInput.isVisible()) await needsInput.fill(updates.specialNeeds);
    }

    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForLoadState("networkidle");
      return { success: true };
    }

    return { success: false };
  }

  async getPets(): Promise<Pet[]> {
    if (!this.session.isLoggedIn) {
      throw new Error("You must be logged in to view pets.");
    }
    const page = this.ensurePage();
    await page.goto(`${this.BASE_URL}/account/pets/`);
    await page.waitForLoadState("networkidle");

    const pets = await page.evaluate(() => {
      const items: Array<{
        id: string;
        name: string;
        species: string;
        breed: string | undefined;
        age: number | undefined;
        weight: number | undefined;
        profilePhotoUrl: string | undefined;
      }> = [];

      const petCards = document.querySelectorAll(
        '[class*="pet-card"], [class*="PetCard"], [data-testid*="pet"]'
      );
      petCards.forEach((card, i) => {
        const nameEl = card.querySelector('[class*="name"], h3, h2');
        const breedEl = card.querySelector('[class*="breed"]');
        const ageEl = card.querySelector('[class*="age"]');
        const imgEl = card.querySelector("img");
        const link = card.querySelector("a");
        const petId =
          link?.getAttribute("href")?.split("/").filter(Boolean).pop() || `pet-${i}`;

        items.push({
          id: petId,
          name: nameEl?.textContent?.trim() || "",
          species: "dog",
          breed: breedEl?.textContent?.trim(),
          age: ageEl ? parseInt(ageEl.textContent?.replace(/[^\d]/g, "") || "0", 10) : undefined,
          weight: undefined,
          profilePhotoUrl: (imgEl as HTMLImageElement)?.src,
        });
      });
      return items;
    });

    return pets as Pet[];
  }

  async leaveReview(
    bookingId: string,
    rating: number,
    text: string
  ): Promise<{ success: boolean }> {
    if (!this.session.isLoggedIn) {
      throw new Error("You must be logged in to leave a review.");
    }
    const page = this.ensurePage();
    await page.goto(`${this.BASE_URL}/dashboard/bookings/${bookingId}/review/`);
    await page.waitForLoadState("networkidle");

    const starEl = page.locator(`[data-rating="${rating}"], [aria-label="${rating} stars"]`).first();
    if (await starEl.isVisible()) await starEl.click();

    const textArea = page.locator("textarea").first();
    if (await textArea.isVisible()) {
      await textArea.fill(text);
      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForLoadState("networkidle");
        return { success: true };
      }
    }

    return { success: false };
  }

  async getFavorites(): Promise<SitterResult[]> {
    if (!this.session.isLoggedIn) {
      throw new Error("You must be logged in to view favorites.");
    }
    const page = this.ensurePage();
    await page.goto(`${this.BASE_URL}/account/favorites/`);
    await page.waitForLoadState("networkidle");

    const favorites = await page.evaluate(() => {
      const items: Array<{
        id: string;
        name: string;
        location: string;
        rating: number;
        reviewCount: number;
        price: number;
        priceUnit: string;
        services: string[];
        profileUrl: string;
        avatarUrl: string | undefined;
      }> = [];

      const cards = document.querySelectorAll(
        '[class*="sitter-card"], [class*="favorite"], article'
      );
      cards.forEach((card, i) => {
        const nameEl = card.querySelector('h3, h2, [class*="name"]');
        const ratingEl = card.querySelector('[class*="rating"]');
        const priceEl = card.querySelector('[class*="price"]');
        const locationEl = card.querySelector('[class*="location"]');
        const linkEl = card.querySelector("a");
        const imgEl = card.querySelector("img");

        if (nameEl?.textContent?.trim()) {
          items.push({
            id: `fav-${i}`,
            name: nameEl.textContent.trim(),
            location: locationEl?.textContent?.trim() || "",
            rating: parseFloat(ratingEl?.textContent?.trim() || "0") || 0,
            reviewCount: 0,
            price: parseFloat(priceEl?.textContent?.replace(/[^\d.]/g, "") || "0") || 0,
            priceUnit: "night",
            services: [],
            profileUrl: (linkEl as HTMLAnchorElement)?.href || "",
            avatarUrl: (imgEl as HTMLImageElement)?.src,
          });
        }
      });
      return items;
    });

    return favorites;
  }

  getSession(): RoverSession {
    return this.session;
  }
}
