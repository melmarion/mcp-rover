# @striderlabs/mcp-rover

A Model Context Protocol (MCP) connector for [Rover](https://www.rover.com) — the pet services marketplace. Enables AI assistants to search for pet sitters, manage bookings, communicate with sitters, and handle pet profiles through Rover's platform.

## Features

- Search pet sitters by location, service type, and dates
- View detailed sitter profiles with reviews and pricing
- Browse available service types (boarding, walking, drop-in, etc.)
- Request bookings and manage existing ones
- Send and receive messages with sitters
- Manage pet profiles (add, update, list)
- Leave reviews for completed services
- View favorited sitters

## Prerequisites

- Node.js 18+
- A Rover account at [rover.com](https://www.rover.com)
- Playwright browsers installed

## Installation

```bash
npm install @striderlabs/mcp-rover

# Install Playwright browsers (first time only)
npx playwright install chromium
```

## MCP Configuration

Add to your MCP client configuration (e.g., Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "rover": {
      "command": "npx",
      "args": ["-y", "@striderlabs/mcp-rover"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "rover": {
      "command": "mcp-rover"
    }
  }
}
```

## Available Tools

### Authentication

#### `login`
Log in to your Rover account.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | Your Rover email |
| password | string | Yes | Your Rover password |

### Sitter Search

#### `search_sitters`
Search for pet sitters by location and service type.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| location | string | Yes | City, neighborhood, or zip code |
| serviceType | enum | Yes | `boarding`, `house_sitting`, `drop_in`, `doggy_day_care`, `dog_walking` |
| startDate | string | No | YYYY-MM-DD format |
| endDate | string | No | YYYY-MM-DD format |
| petCount | number | No | Number of pets |
| petSize | enum | No | `small`, `medium`, `large`, `giant` |

#### `get_sitter_profile`
Get detailed profile for a sitter including reviews and rates.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sitterIdOrUrl | string | Yes | Sitter username or full Rover profile URL |

#### `search_services`
List all available service types in a location.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| location | string | Yes | Location to search |

### Bookings

#### `request_booking`
Send a booking request to a sitter. Requires login.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sitterId | string | Yes | Sitter ID or profile URL |
| serviceType | enum | Yes | Type of service |
| startDate | string | Yes | YYYY-MM-DD |
| endDate | string | Yes | YYYY-MM-DD |
| petIds | string[] | Yes | Array of pet IDs |
| message | string | No | Message to the sitter |

#### `get_bookings`
View all current and past bookings. Requires login.

### Messaging

#### `message_sitter`
Send a message to a sitter. Requires login.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sitterId | string | Yes | Sitter ID or profile URL |
| message | string | Yes | Message text |

#### `get_messages`
Get message threads. Requires login.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sitterId | string | No | Filter to a specific sitter thread |

### Pet Management

#### `add_pet_profile`
Add a new pet to your account. Requires login.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Pet's name |
| species | enum | Yes | `dog`, `cat`, `other` |
| breed | string | No | Pet's breed |
| age | number | No | Age in years |
| weight | number | No | Weight in pounds |
| size | enum | No | `small`, `medium`, `large`, `giant` |
| temperament | string | No | Personality description |
| specialNeeds | string | No | Medical/care requirements |
| vaccinated | boolean | No | Vaccination status |
| spayedNeutered | boolean | No | Spayed/neutered status |

#### `update_pet_profile`
Update an existing pet profile. Requires login.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| petId | string | Yes | Pet's Rover ID |
| ...fields | — | No | Any fields from `add_pet_profile` |

#### `get_pets`
List all pets on your account. Requires login.

### Reviews & Favorites

#### `leave_review`
Leave a review for a completed service. Requires login.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| bookingId | string | Yes | Booking ID |
| rating | number | Yes | 1–5 stars |
| reviewText | string | Yes | Written review |

#### `get_favorites`
Get your list of favorited sitters. Requires login.

## Usage Examples

```
# Search for dog boarders in Seattle for a week
search_sitters location="Seattle, WA" serviceType="boarding" startDate="2025-06-01" endDate="2025-06-07"

# View a sitter's full profile
get_sitter_profile sitterIdOrUrl="john-d"

# Book a sitter
request_booking sitterId="john-d" serviceType="boarding" startDate="2025-06-01" endDate="2025-06-07" petIds=["pet-123"] message="Hi! My dog Bella is friendly and loves to play."

# Send a message
message_sitter sitterId="john-d" message="Hi, is your place good for large dogs?"
```

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode
npm run dev
```

## Architecture

- **`src/index.ts`** — MCP server entry point. Defines all tools, handles request routing, formats responses.
- **`src/browser.ts`** — Playwright-based browser automation layer. Handles all interactions with rover.com.

The server uses stdio transport for MCP communication and launches a headless Chromium browser to interact with Rover's website.

## Notes

- This connector uses browser automation to interact with Rover's website, as Rover does not provide a public API.
- Login credentials are only used for the current session and are never stored.
- Browser runs in headless mode by default.

## License

MIT
