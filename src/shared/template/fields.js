// Template field definitions

export const TEMPLATE_FIELDS = {
  // Basic fields
  url: {
    name: "URL",
    description: "Current page URL (with cleaning rules applied)",
    example: "https://example.com/page",
    category: "basic",
  },
  originalUrl: {
    name: "Original URL",
    description: "Original URL (without cleaning rules)",
    example: "https://example.com/page?utm_source=test",
    category: "basic",
  },
  title: {
    name: "Page Title",
    description: "Current page title",
    example: "Example Page - Site Name",
    category: "basic",
  },
  hostname: {
    name: "Hostname",
    description: "Full hostname (with subdomains)",
    example: "www.example.com",
    category: "basic",
  },
  domain: {
    name: "Domain",
    description: "Pure domain (without subdomains)",
    example: "example.com",
    category: "basic",
  },
  shortUrl: {
    name: "Short URL",
    description: "Auto-generated short URL",
    example: "https://is.gd/abc123",
    category: "basic",
  },

  // Page metadata fields
  author: {
    name: "Author",
    description: "Page author (meta tag)",
    example: "John Doe",
    category: "metadata",
  },
  description: {
    name: "Description",
    description: "Page description (meta tag)",
    example: "This is an example page description",
    category: "metadata",
  },

  // Time fields
  date: {
    name: "Date",
    description: "Current date (local timezone)",
    example: "2024-01-15",
    category: "time",
  },
  time: {
    name: "Time",
    description: "Current time (local timezone)",
    example: "14:30:25",
    category: "time",
  },
  datetime: {
    name: "Date Time",
    description: "Full date time (local timezone)",
    example: "2024-01-15 14:30:25",
    category: "time",
  },
  timestamp: {
    name: "Timestamp",
    description: "Unix timestamp (global)",
    example: "1705315825",
    category: "time",
  },
  iso: {
    name: "ISO Time",
    description: "ISO format time (UTC timezone)",
    example: "2024-01-15T14:30:25.000Z",
    category: "time",
  },
};
