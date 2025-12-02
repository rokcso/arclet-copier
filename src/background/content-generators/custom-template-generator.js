// Custom template content generator

import {
  processUrl,
  getAllTemplates,
  processTemplateWithFallback,
} from "../../shared/constants.js";
import { getLocalMessage } from "../../shared/ui/i18n.js";
import { BaseContentGenerator } from "./base-generator.js";

/**
 * Generator for custom template format
 */
export class CustomTemplateContentGenerator extends BaseContentGenerator {
  async generate(formatInfo, tab, settings, helpers) {
    const { templateId } = formatInfo;

    try {
      const title = await helpers.getPageTitle(tab.id, tab.url, tab);
      const metadata = await helpers.getPageMetadata(tab.id);

      const context = {
        url: tab.url,
        title: title || "",
        urlCleaning: settings.urlCleaning,
        shortUrl: "",
        author: metadata.author || "",
        description: metadata.description || "",
      };

      // Check if template needs short URL
      const template = await getAllTemplates().then((templates) =>
        templates.find((t) => t.id === templateId),
      );

      let templateName = null;
      if (template) {
        templateName = template.name;
        if (template.template.includes("{{shortUrl}}")) {
          try {
            const shortUrl = await helpers.handleCreateShortUrl(
              tab.url,
              settings.shortUrlService,
            );
            context.shortUrl = shortUrl;
          } catch (error) {
            console.debug("Error generating short URL for template:", error);
            context.shortUrl = await processUrl(
              tab.url,
              settings.urlCleaning,
            );
          }
        }
      }

      const result = await processTemplateWithFallback(
        templateId,
        context,
        await processUrl(tab.url, settings.urlCleaning),
      );

      return {
        content: result.content,
        message: result.success
          ? getLocalMessage("customTemplateCopied") ||
            `${result.templateName} copied`
          : getLocalMessage("urlCopied"),
        format: "custom",
        templateName,
      };
    } catch (error) {
      console.debug("Error processing custom template:", error);
      // Fallback to URL
      return {
        content: await processUrl(tab.url, settings.urlCleaning),
        message: getLocalMessage("urlCopied"),
        format: "url",
        templateName: null,
      };
    }
  }
}
