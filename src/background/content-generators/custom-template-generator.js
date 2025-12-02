// Custom template content generator

import {
  processUrl,
  getAllTemplates,
  processTemplateWithFallback,
} from "../../shared/constants.js";
import { getLocalMessage } from "../../shared/ui/i18n.js";
import { BaseContentGenerator } from "./base-generator.js";

/**
 * Generator for custom template format（性能优化版 - 懒加载元数据）
 */
export class CustomTemplateContentGenerator extends BaseContentGenerator {
  async generate(formatInfo, tab, settings, helpers) {
    const { templateId } = formatInfo;

    try {
      // 优化: 先获取模板，再决定需要加载哪些数据
      const template = await getAllTemplates().then((templates) =>
        templates.find((t) => t.id === templateId),
      );

      let templateName = null;
      const context = {
        url: tab.url,
        title: "",
        urlCleaning: settings.urlCleaning,
        shortUrl: "",
        author: "",
        description: "",
      };

      if (template) {
        templateName = template.name;
        const templateStr = template.template;

        // 优化: 只在模板需要时才获取 title
        if (templateStr.includes("{{title}}")) {
          context.title = await helpers.getPageTitle(tab.id, tab.url, tab);
        }

        // 优化: 只在模板需要元数据时才获取（懒加载）
        if (templateStr.includes("{{author}}") || templateStr.includes("{{description}}")) {
          console.log("[Performance] Template needs metadata, fetching...");
          const metadata = await helpers.getPageMetadata(tab.id);
          context.author = metadata.author || "";
          context.description = metadata.description || "";
        } else {
          console.log("[Performance] Template doesn't need metadata, skipping fetch");
        }

        // 优化: 只在模板需要短链时才生成
        if (templateStr.includes("{{shortUrl}}")) {
          console.log("[Performance] Template needs short URL, generating...");
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
