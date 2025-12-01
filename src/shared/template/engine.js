// Template engine for variable replacement

import { processUrl } from "../url/url-processor.js";
import { TEMPLATE_FIELDS } from "./fields.js";

/**
 * Template engine - handles template variable replacement
 */
export class TemplateEngine {
  constructor() {
    this.fieldProcessors = new Map();
    this.initializeFieldProcessors();
  }

  initializeFieldProcessors() {
    // Basic field processors (async)
    this.fieldProcessors.set(
      "url",
      async (context) => await processUrl(context.url, context.urlCleaning),
    );
    this.fieldProcessors.set("originalUrl", (context) => context.url);
    this.fieldProcessors.set("title", (context) => context.title || "");
    this.fieldProcessors.set("hostname", (context) => {
      try {
        if (!context.url) {
          return "";
        }
        const url = new URL(context.url);
        return url.hostname; // full hostname including subdomains, e.g. www.example.com
      } catch {
        console.debug(
          "TemplateEngine: Invalid URL for hostname field:",
          context.url,
        );
        return "";
      }
    });
    this.fieldProcessors.set("domain", (context) => {
      try {
        if (!context.url) {
          return "";
        }
        const url = new URL(context.url);
        // Extract pure domain (remove subdomains)
        const hostname = url.hostname;
        const parts = hostname.split(".");

        // Handle special cases: localhost, IP addresses, etc.
        if (parts.length <= 2 || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
          return hostname;
        }

        // Extract main domain (last two parts)
        // e.g.: www.example.com -> example.com
        //       blog.sub.example.com -> example.com
        return parts.slice(-2).join(".");
      } catch {
        console.debug(
          "TemplateEngine: Invalid URL for domain field:",
          context.url,
        );
        return "";
      }
    });
    this.fieldProcessors.set("shortUrl", (context) => context.shortUrl || "");

    // Page metadata field processors
    this.fieldProcessors.set("author", (context) => context.author || "");
    this.fieldProcessors.set(
      "description",
      (context) => context.description || "",
    );

    // Time field processors - fixed: get current time on each call
    this.fieldProcessors.set("date", () => {
      const now = new Date();
      return (
        now.getFullYear() +
        "-" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(now.getDate()).padStart(2, "0")
      );
    });

    this.fieldProcessors.set("time", () => {
      const now = new Date();
      return now.toTimeString().split(" ")[0];
    });

    this.fieldProcessors.set("datetime", () => {
      const now = new Date();
      return (
        now.getFullYear() +
        "-" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(now.getDate()).padStart(2, "0") +
        " " +
        String(now.getHours()).padStart(2, "0") +
        ":" +
        String(now.getMinutes()).padStart(2, "0") +
        ":" +
        String(now.getSeconds()).padStart(2, "0")
      );
    });

    this.fieldProcessors.set("timestamp", () => {
      const now = new Date();
      return Math.floor(now.getTime() / 1000).toString();
    });

    this.fieldProcessors.set("iso", () => {
      const now = new Date();
      return now.toISOString();
    });
  }

  /**
   * Process template, replace all variables
   * @param {string} template - Template string
   * @param {object} context - Context object
   * @returns {Promise<string>} Processed result
   */
  async processTemplate(template, context) {
    if (!template) {
      return "";
    }

    // Validate input parameters
    if (!context || typeof context !== "object") {
      console.debug(
        "TemplateEngine: Invalid context provided, using empty context",
      );
      context = {};
    }

    try {
      // Match {{fieldName}} pattern
      const fieldPattern = /\{\{([^}]+)\}\}/g;

      // First find all fields to replace
      const matches = [...template.matchAll(fieldPattern)];
      let result = template;

      // Process each field (supports async)
      for (const match of matches) {
        try {
          const fieldName = match[1].trim();
          const processor = this.fieldProcessors.get(fieldName);

          if (processor) {
            const value = await processor(context);
            // Ensure string type is returned
            const replacement = value !== null ? String(value) : "";
            result = result.replace(match[0], replacement);
          }
        } catch (error) {
          console.debug(
            `TemplateEngine: Error processing field '${match[1]}':`,
            error,
          );
          // Keep original on error
        }
      }

      return result;
    } catch (error) {
      console.debug("TemplateEngine: Template processing failed:", error);
      return template; // Fallback: return original template
    }
  }

  /**
   * Validate template syntax
   * @param {string} template - Template string
   * @returns {object} Validation result
   */
  validateTemplate(template) {
    if (!template) {
      return { valid: false, errors: ["Template is empty"], fields: [] };
    }

    if (typeof template !== "string") {
      return {
        valid: false,
        errors: ["Template must be a string"],
        fields: [],
      };
    }

    try {
      const fieldPattern = /\{\{([^}]+)\}\}/g;
      const matches = [...template.matchAll(fieldPattern)];
      const errors = [];
      const fields = [];

      for (const match of matches) {
        const fieldName = match[1].trim();

        // Check if field name is empty
        if (!fieldName) {
          errors.push("Empty field name found: {{}}");
          continue;
        }

        // Check if field name contains invalid characters
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldName)) {
          errors.push(
            `Invalid field name: ${fieldName} (only letters, numbers, and underscores allowed)`,
          );
          continue;
        }

        // Only record known fields, unknown fields will be treated as plain text
        if (this.fieldProcessors.has(fieldName)) {
          fields.push(fieldName);
        }
      }

      return {
        valid: errors.length === 0,
        errors: errors,
        fields: [...new Set(fields)], // deduplicate
      };
    } catch (error) {
      console.debug("TemplateEngine: Template validation failed:", error);
      return {
        valid: false,
        errors: ["Template validation failed due to internal error"],
        fields: [],
      };
    }
  }

  /**
   * Get fields used in template
   * @param {string} template - Template string
   * @returns {string[]} Field names
   */
  getTemplateFields(template) {
    const fieldPattern = /\{\{([^}]+)\}\}/g;
    const fields = new Set();
    let match;

    while ((match = fieldPattern.exec(template)) !== null) {
      fields.add(match[1].trim());
    }

    return Array.from(fields);
  }
}

// Global template engine instance
export const templateEngine = new TemplateEngine();

// Re-export TEMPLATE_FIELDS for convenience
export { TEMPLATE_FIELDS };
