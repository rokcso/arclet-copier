// 国际化服务

export class I18nService {
  constructor() {
    this.currentLocale = "zh_CN";
    this.localeMessages = {};
  }

  // 加载本地化消息
  async loadLocaleMessages(locale) {
    try {
      const response = await fetch(
        chrome.runtime.getURL(`_locales/${locale}/messages.json`),
      );
      const messages = await response.json();
      return messages;
    } catch (error) {
      console.error("Failed to load locale messages:", error);
      return {};
    }
  }

  // 获取消息
  getMessage(key, substitutions = []) {
    if (this.localeMessages[key] && this.localeMessages[key].message) {
      return this.localeMessages[key].message;
    }
    // Fallback to Chrome i18n API
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  // 初始化国际化
  async initialize(locale) {
    if (locale) {
      this.currentLocale = locale;
    }

    // 加载当前语言的消息
    this.localeMessages = await this.loadLocaleMessages(this.currentLocale);

    // 应用本地化到所有带有 data-i18n 属性的元素
    this.applyLocalizationToElements();
  }

  // 应用本地化到DOM元素
  applyLocalizationToElements() {
    const i18nElements = document.querySelectorAll("[data-i18n]");
    i18nElements.forEach((element) => {
      const key = element.getAttribute("data-i18n");
      const message = this.getMessage(key);
      if (message && message !== key) {
        if (element.tagName === "INPUT" && element.type === "text") {
          element.placeholder = message;
        } else {
          element.textContent = message;
        }
      }
    });
  }

  // 切换语言
  async switchLanguage(newLocale) {
    if (newLocale !== this.currentLocale) {
      await this.initialize(newLocale);
      return true;
    }
    return false;
  }
}
