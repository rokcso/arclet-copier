// Short URL content generator

import { isValidWebUrl } from "../../shared/constants.js";
import { getLocalMessage } from "../../shared/ui/i18n.js";
import { BaseContentGenerator } from "./base-generator.js";

/**
 * Generator for short URL format
 */
export class ShortUrlContentGenerator extends BaseContentGenerator {
  async generate(formatInfo, tab, settings, helpers) {
    if (!isValidWebUrl(tab.url)) {
      throw new Error(
        getLocalMessage("invalidUrlForShortening") ||
          "URL is not suitable for shortening",
      );
    }

    const shortUrl = await helpers.handleCreateShortUrl(
      tab.url,
      settings.shortUrlService,
    );

    return {
      content: shortUrl,
      message: getLocalMessage("shortUrlCopied"),
      format: "shortUrl",
      templateName: null,
    };
  }
}
