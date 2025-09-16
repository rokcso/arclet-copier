// 弹窗主UI逻辑 - 模块化重构版本

import { EXTENSION_CONFIG } from "../shared/constants.js";
import { I18nUtils, UrlUtils } from "../shared/utils.js";
import { StorageManager } from "../shared/storage-manager.js";
import { UrlProcessor } from "../services/url-processor.js";
import { ClipboardService } from "../services/clipboard-service.js";
import { ThemeService } from "../services/theme-service.js";
import { I18nService } from "../services/i18n-service.js";
import { SettingsUI } from "./settings-ui.js";
import { NotificationUI } from "./notification-ui.js";
import { QRModal } from "./qr-modal.js";

export class PopupUI {
  constructor() {
    this.elements = {
      urlDisplay: document.getElementById("urlDisplay"),
      copyBtn: document.getElementById("copyBtn"),
      markdownBtn: document.getElementById("markdownBtn"),
      qrBtn: document.getElementById("qrBtn"),
      version: document.getElementById("version"),
    };

    this.currentUrl = "";
    this.currentTitle = "";

    // 初始化子组件
    this.i18nService = new I18nService();
    this.settingsUI = new SettingsUI();
    this.notificationUI = new NotificationUI();
    this.qrModal = new QRModal();
  }

  // 初始化PopupUI
  async initialize() {
    try {
      this.loadVersion();

      // 初始化设置UI组件
      const urlCleaningSwitch = this.settingsUI.initializeUrlCleaningSelect(
        () => {
          this.saveSettingsAndUpdateDisplay();
        },
      );

      const appearanceSwitch = this.settingsUI.initializeAppearanceSwitch();

      // 绑定设置相关事件
      this.settingsUI.bindEventListeners({
        onLanguageChange: (locale) => this.handleLanguageChange(locale),
      });

      // 加载设置并初始化主题
      await this.settingsUI.loadSettings();
      await this.initializeTheme();

      // 立即更新滑块位置以反映加载的设置
      if (urlCleaningSwitch && urlCleaningSwitch.updateSliderPosition) {
        console.log("手动更新URL清理滑块位置");
        urlCleaningSwitch.updateSliderPosition();
      }
      if (appearanceSwitch && appearanceSwitch.updateSliderPosition) {
        console.log("手动更新外观滑块位置");
        appearanceSwitch.updateSliderPosition();
      }

      // 初始化国际化
      const settings = await StorageManager.getUserSettings();
      await this.i18nService.initialize(settings.language);

      // 获取当前页面URL
      await this.getCurrentUrl();

      // 绑定按钮事件
      this.bindEventListeners();

      // 键盘快捷键
      this.setupKeyboardShortcuts();

      // 在DOM和本地化完成后再次重新计算滑块位置（保险起见）
      setTimeout(() => {
        if (urlCleaningSwitch && urlCleaningSwitch.updateSliderPosition) {
          console.log("延迟更新URL清理滑块位置");
          urlCleaningSwitch.updateSliderPosition();
        }
        if (appearanceSwitch && appearanceSwitch.updateSliderPosition) {
          console.log("延迟更新外观滑块位置");
          appearanceSwitch.updateSliderPosition();
        }
      }, 100);
    } catch (error) {
      console.error("PopupUI初始化失败:", error);
      this.handleError(I18nUtils.getMessage("initializationFailed"));
    }
  }

  // 加载版本信息
  loadVersion() {
    const manifest = chrome.runtime.getManifest();
    if (manifest && manifest.version && this.elements.version) {
      this.elements.version.textContent = `v${manifest.version}`;
    }
  }

  // 初始化主题
  async initializeTheme() {
    const settings = await StorageManager.getUserSettings();
    const savedTheme = settings.appearance;

    // 应用主题
    ThemeService.applyTheme(savedTheme);

    // 监听系统主题变化
    ThemeService.setupSystemThemeListener(() => {
      const currentTheme =
        this.settingsUI.elements.appearanceSwitch?.getAttribute("data-value");
      if (currentTheme === "system") {
        ThemeService.applyTheme("system");
      }
    });
  }

  // 处理语言切换
  async handleLanguageChange(locale) {
    const changed = await this.i18nService.switchLanguage(locale);
    if (changed) {
      this.updateUrlDisplay();
    }
  }

  // 获取当前页面URL
  async getCurrentUrl() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab && tab.url) {
        this.currentUrl = tab.url;

        // 获取页面标题，但在特殊页面跳过脚本注入
        if (tab.id && !UrlUtils.isRestrictedPage(tab.url)) {
          this.currentTitle = await this.getPageTitle(tab.id);
        } else if (UrlUtils.isRestrictedPage(tab.url)) {
          // 对于特殊页面，使用tab.title或从URL生成标题
          this.currentTitle =
            tab.title || UrlUtils.generateTitleFromUrl(tab.url) || "特殊页面";
        }

        this.updateUrlDisplay();
      } else {
        this.handleError(I18nUtils.getMessage("noUrl"));
      }
    } catch (error) {
      console.error("获取 URL 失败:", error);
      this.handleError(I18nUtils.getMessage("getUrlFailed"));
    }
  }

  // 获取页面标题
  async getPageTitle(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.title,
      });
      return results[0]?.result || "";
    } catch (error) {
      console.error("获取页面标题失败:", error);
      return "";
    }
  }

  // 处理错误状态
  handleError(message) {
    if (this.elements.urlDisplay) {
      this.elements.urlDisplay.textContent = message;
    }
    if (this.elements.copyBtn) this.elements.copyBtn.disabled = true;
    if (this.elements.markdownBtn) this.elements.markdownBtn.disabled = true;
  }

  // 更新URL显示
  async updateUrlDisplay() {
    if (!this.currentUrl || !this.elements.urlDisplay) return;

    const settings = await StorageManager.getUserSettings();
    console.log("updateUrlDisplay - 当前设置:", settings);
    console.log("updateUrlDisplay - 原始URL:", this.currentUrl);

    const processedUrl = UrlProcessor.processUrl(
      this.currentUrl,
      settings.urlCleaning,
    );
    console.log("updateUrlDisplay - 处理后URL:", processedUrl);

    this.elements.urlDisplay.textContent = processedUrl;
  }

  // 保存设置并更新显示
  async saveSettingsAndUpdateDisplay() {
    // 读取当前UI中的设置值
    const currentSettings = {
      urlCleaning:
        this.settingsUI.elements.removeParamsToggle?.getAttribute(
          "data-value",
        ) || "smart",
      silentCopyFormat:
        this.settingsUI.elements.silentCopyFormat?.value || "url",
      appearance:
        this.settingsUI.elements.appearanceSwitch?.getAttribute("data-value") ||
        "system",
      language: this.settingsUI.elements.languageSelect?.value || "zh_CN",
    };

    console.log("保存设置:", currentSettings);

    // 保存到存储
    await StorageManager.saveUserSettings(currentSettings);

    // 更新显示
    await this.updateUrlDisplay();
  }

  // 复制URL到剪贴板
  async copyUrl() {
    const settings = await StorageManager.getUserSettings();
    const processedUrl = UrlProcessor.processUrl(
      this.currentUrl,
      settings.urlCleaning,
    );

    try {
      await ClipboardService.copyFromPopup(processedUrl);
      this.showStatus();
    } catch (error) {
      console.error("复制失败:", error);
      // 对于特殊页面，不要报错，只是静默失败并显示成功状态
      if (UrlUtils.isRestrictedPage(this.currentUrl)) {
        console.log("特殊页面，使用fallback复制");
        try {
          ClipboardService.fallbackCopy(processedUrl);
          this.showStatus();
        } catch (fallbackError) {
          console.error("特殊页面降级复制失败:", fallbackError);
        }
      } else {
        try {
          ClipboardService.fallbackCopy(processedUrl);
          this.showStatus();
        } catch (fallbackError) {
          console.error("降级复制也失败:", fallbackError);
        }
      }
    }
  }

  // 复制 markdown 链接
  async copyMarkdown() {
    const settings = await StorageManager.getUserSettings();
    const markdownLink = UrlProcessor.createMarkdownLink(
      this.currentUrl,
      this.currentTitle,
      settings.urlCleaning,
    );

    try {
      await ClipboardService.copyFromPopup(markdownLink);
      this.notificationUI.showArcNotification(
        I18nUtils.getMessage("markdownCopied"),
      );
    } catch (error) {
      console.error("Markdown复制失败:", error);
      // 对于特殊页面，不要报错，只是静默失败并显示成功状态
      if (UrlUtils.isRestrictedPage(this.currentUrl)) {
        console.log("特殊页面，使用fallback复制 Markdown");
        try {
          ClipboardService.fallbackCopy(markdownLink);
          this.notificationUI.showArcNotification(
            I18nUtils.getMessage("markdownCopied"),
          );
        } catch (fallbackError) {
          console.error("特殊页面 Markdown 降级复制失败:", fallbackError);
        }
      } else {
        try {
          ClipboardService.fallbackCopy(markdownLink);
          this.notificationUI.showArcNotification(
            I18nUtils.getMessage("markdownCopied"),
          );
        } catch (fallbackError) {
          console.error("Markdown降级复制也失败:", fallbackError);
        }
      }
    }
  }

  // 显示复制成功状态
  showStatus() {
    // 显示Arc风格通知
    this.notificationUI.showArcNotification(I18nUtils.getMessage("urlCopied"));

    // 显示系统通知
    this.notificationUI.showSystemNotification(
      EXTENSION_CONFIG.NAME,
      I18nUtils.getMessage("urlCopied"),
    );
  }

  // 显示二维码
  showQRCode() {
    const settings = StorageManager.getUserSettings().then((settings) => {
      const processedUrl = UrlProcessor.processUrl(
        this.currentUrl,
        settings.urlCleaning,
      );
      this.qrModal.show(processedUrl);
    });
  }

  // 绑定事件监听器
  bindEventListeners() {
    if (this.elements.copyBtn) {
      this.elements.copyBtn.addEventListener("click", () => this.copyUrl());
    }

    if (this.elements.markdownBtn) {
      this.elements.markdownBtn.addEventListener("click", () =>
        this.copyMarkdown(),
      );
    }

    if (this.elements.qrBtn) {
      this.elements.qrBtn.addEventListener("click", () => this.showQRCode());
    }
  }

  // 设置键盘快捷键
  setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && !e.shiftKey) {
        e.preventDefault();
        this.copyUrl();
      }
    });
  }
}

// DOM加载完成后初始化
document.addEventListener("DOMContentLoaded", async () => {
  const popupUI = new PopupUI();
  await popupUI.initialize();
});
