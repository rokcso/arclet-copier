import {
  processUrl,
  SHORT_URL_SERVICES,
  loadTemplatesIntoSelect,
  validateAndFixSelector,
  isValidWebUrl,
  getOrGenerateShortUrl,
} from "../../shared/constants.js";

import { trackCopy } from "../../shared/analytics.js";
import settingsManager from "../../shared/settings-manager.js";
import toast from "../../shared/toast.js";
import {
  initializeThreeWaySwitch,
  getUrlCleaningOptions,
} from "../../shared/three-way-switch.js";
import {
  initializeI18n,
  getLocalMessage,
} from "../../shared/ui/i18n.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 复制操作状态管理
  const copyOperationStates = {
    copyUrl: false,
    copyMarkdown: false,
    generateShortUrl: false,
    copyQRCode: false,
  };

  // 加载自定义模板到静默复制格式选择器
  async function loadCustomTemplates(preserveValue = null) {
    await loadTemplatesIntoSelect(elements.silentCopyFormat, {
      includeIcons: true,
      clearExisting: true,
      onError: (error) => {
        console.debug("Failed to load custom templates in popup:", error);
      },
    });

    // 如果指定了要保持的值，则验证并修正
    if (preserveValue) {
      await validateAndFixSelector(
        elements.silentCopyFormat,
        preserveValue,
        "silentCopyFormat",
        settingsManager.updateSettings.bind(settingsManager),
      );
    }
  }

  // 监听模板变更消息
  function setupTemplateChangeListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "TEMPLATE_CHANGED") {
        console.log(
          `Popup received template change notification: ${message.changeType}`,
        );

        // 保存当前选中的值
        const currentValue = elements.silentCopyFormat.value;

        // 重新加载模板并验证
        loadCustomTemplates(currentValue).catch((error) => {
          console.debug("Failed to reload templates after change:", error);
        });

        sendResponse({ received: true });
      }
    });
  }

  // DOM elements
  const elements = {
    pageTitle: document.getElementById("pageTitle"),
    pageUrl: document.getElementById("pageUrl"),
    copyBtn: document.getElementById("copyBtn"),
    markdownBtn: document.getElementById("markdownBtn"),
    shortUrlBtn: document.getElementById("shortUrlBtn"),
    qrBtn: document.getElementById("qrBtn"),
    batchBtn: document.getElementById("batchBtn"),
    removeParamsToggle: document.getElementById("removeParamsToggle"),
    silentCopyFormat: document.getElementById("silentCopyFormat"),
    version: document.getElementById("version"),
    qrModal: document.getElementById("qrModal"),
    qrModalOverlay: document.getElementById("qrModalOverlay"),
    qrModalClose: document.getElementById("qrModalClose"),
    qrCodeContainer: document.getElementById("qrCodeContainer"),
    qrUrlDisplay: document.getElementById("qrUrlDisplay"),
    qrCopyBtn: document.getElementById("qrCopyBtn"),
    moreSettingsBtn: document.getElementById("moreSettingsBtn"),
  };

  let currentUrl = "";
  let currentTitle = "";

  // Load version from manifest
  function loadVersion() {
    const manifest = chrome.runtime.getManifest();
    if (manifest && manifest.version) {
      elements.version.textContent = `v${manifest.version}`;
    }
  }


  // 初始化URL清理选择器
  function initializeUrlCleaningSelect() {
    const cleaningOptions = getUrlCleaningOptions();

    return initializeThreeWaySwitch(
      elements.removeParamsToggle,
      cleaningOptions,
      (value, option) => {
        // 显示通知
        if (option.key) {
          toast.success(getLocalMessage(option.key));
        }
        saveSettings();
        updatePageDisplay();
      },
    );
  }

  function applyTheme(theme) {
    const htmlElement = document.documentElement;

    if (theme === "system") {
      htmlElement.removeAttribute("data-theme");
    } else {
      htmlElement.setAttribute("data-theme", theme);
    }
  }

  // 应用主题色
  function applyThemeColor(color) {
    const htmlElement = document.documentElement;
    htmlElement.setAttribute("data-color", color);
  }

  // 加载设置 - 使用统一的设置管理器
  async function loadSettings() {
    const settings = await settingsManager.getAllSettings();

    // 设置UI控件值
    const cleaningSelect = elements.removeParamsToggle;
    cleaningSelect.setAttribute("data-value", settings.urlCleaning);

    // 应用主题和语言设置
    applyTheme(settings.appearance);
    applyThemeColor(settings.themeColor);

    return {
      silentCopyFormat: settings.silentCopyFormat,
      allSettings: settings,
    };
  }

  // 保存设置 - 使用统一的设置管理器
  async function saveSettings() {
    const cleaningSelect = elements.removeParamsToggle;

    await settingsManager.updateSettings({
      urlCleaning: cleaningSelect.getAttribute("data-value"),
      silentCopyFormat: elements.silentCopyFormat.value,
    });
  }

  // Handle silent copy format change
  async function handleSilentCopyFormatChange() {
    await saveSettings();
    toast.success(getLocalMessage("silentCopyFormatChanged"));
  }

  // 获取页面标题
  async function getPageTitle(tabId, url) {
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab.title || new URL(url).hostname || "";
    } catch (error) {
      console.debug("获取页面标题失败:", error);
      // 如果获取tab失败，尝试从URL生成标题
      try {
        return new URL(url).hostname || "";
      } catch {
        return "";
      }
    }
  }

  // 获取当前页面URL和标题
  async function getCurrentUrlData() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab && tab.url) {
        let title = "";
        if (tab.id) {
          title = await getPageTitle(tab.id, tab.url);
        }

        return {
          success: true,
          url: tab.url,
          title: title,
        };
      } else {
        return {
          success: false,
          error: getLocalMessage("noUrl"),
        };
      }
    } catch (error) {
      console.debug("获取 URL 失败:", error);
      return {
        success: false,
        error: getLocalMessage("noUrl"),
      };
    }
  }

  // 处理错误状态
  function handleError(message) {
    elements.pageTitle.textContent = getLocalMessage("errorTitle") || "Error";
    elements.pageUrl.textContent = message;
    elements.copyBtn.disabled = true;
    elements.markdownBtn.disabled = true;
  }

  // 更新页面信息显示
  async function updatePageDisplay() {
    const cleaningSelect = elements.removeParamsToggle;
    const cleaningMode = cleaningSelect.getAttribute("data-value");
    const processedUrl = await processUrl(currentUrl, cleaningMode);

    // 更新标题显示
    if (currentTitle && currentTitle.trim()) {
      elements.pageTitle.textContent = currentTitle;
    } else {
      // 如果没有标题，使用域名作为后备
      try {
        const hostname = new URL(currentUrl).hostname;
        elements.pageTitle.textContent = hostname;
        elements.pageTitle.setAttribute(
          "data-fallback",
          getLocalMessage("noPageTitle") || "Untitled Page",
        );
      } catch {
        elements.pageTitle.textContent =
          getLocalMessage("noPageTitle") || "Untitled Page";
      }
    }

    // 更新URL显示
    elements.pageUrl.textContent = processedUrl;
  }

  // 创建临时复制元素
  function createTempCopyElement(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    textArea.setAttribute("readonly", "");
    return textArea;
  }

  // 使用execCommand复制的备用方法
  function fallbackCopy(text) {
    const textArea = createTempCopyElement(text);
    document.body.appendChild(textArea);

    textArea.select();
    textArea.setSelectionRange(0, 99999);

    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);

    if (!successful) {
      throw new Error("execCommand copy failed");
    }

    console.log("Popup execCommand copy successful");
  }

  // 复制URL到剪贴板
  async function copyUrl() {
    if (copyOperationStates.copyUrl) {
      return; // 防止重复执行
    }

    copyOperationStates.copyUrl = true;
    const startTime = Date.now();

    try {
      const cleaningSelect = elements.removeParamsToggle;
      const cleaningMode = cleaningSelect.getAttribute("data-value");
      const processedUrl = await processUrl(currentUrl, cleaningMode);

      // 首先尝试现代clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(processedUrl);
        console.log("Popup clipboard API copy successful");
      } else {
        fallbackCopy(processedUrl);
      }

      // 记录成功的复制事件
      const duration = Date.now() - startTime;
      const trackData = {
        format: "url",
        source: "popup",
        success: true,
        duration,
        urlCleaning: cleaningMode !== undefined ? cleaningMode : null,
        templateId: null,
        templateName: null,
        shortService: null,
        errorType: null,
        errorMessage: null,
      };

      trackCopy(trackData).catch((error) => {
        console.debug("Failed to track copy event:", error);
      });

      showStatus();
    } catch (error) {
      console.debug("复制失败:", error);
      let fallbackSuccess = false;

      // 使用fallback复制方法
      try {
        const cleaningSelect = elements.removeParamsToggle;
        const cleaningMode = cleaningSelect.getAttribute("data-value");
        const processedUrl = await processUrl(currentUrl, cleaningMode);
        fallbackCopy(processedUrl);
        fallbackSuccess = true;
        showStatus();
      } catch (fallbackError) {
        console.debug("降级复制也失败:", fallbackError);
      }

      // 记录复制事件（成功或失败）
      const duration = Date.now() - startTime;
      const cleaningSelect = elements.removeParamsToggle;
      const cleaningMode = cleaningSelect.getAttribute("data-value");

      const trackData = {
        format: "url",
        source: "popup",
        success: fallbackSuccess,
        duration,
        urlCleaning: cleaningMode !== undefined ? cleaningMode : null,
        templateId: null,
        templateName: null,
        shortService: null,
        errorType: fallbackSuccess ? null : "clipboard",
        errorMessage: fallbackSuccess ? null : error.message,
      };

      trackCopy(trackData).catch((trackError) => {
        console.debug("Failed to track copy event:", trackError);
      });
    } finally {
      // 300ms后重置状态
      setTimeout(() => {
        copyOperationStates.copyUrl = false;
      }, 300);
    }
  }

  // 创建 markdown 链接格式
  async function createMarkdownLink(url, title) {
    const cleaningSelect = elements.removeParamsToggle;
    const cleaningMode = cleaningSelect.getAttribute("data-value");
    const processedUrl = await processUrl(url, cleaningMode);
    const linkTitle = title || new URL(url).hostname;
    return `[${linkTitle}](${processedUrl})`;
  }

  // 复制 markdown 链接
  async function copyMarkdown() {
    if (copyOperationStates.copyMarkdown) {
      return; // 防止重复执行
    }

    copyOperationStates.copyMarkdown = true;
    const startTime = Date.now();

    try {
      const markdownLink = await createMarkdownLink(currentUrl, currentTitle);

      // 首先尝试现代clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(markdownLink);
        console.log("Popup markdown clipboard API copy successful");
      } else {
        fallbackCopy(markdownLink);
      }

      // 记录成功的复制事件
      const duration = Date.now() - startTime;
      const cleaningSelect = elements.removeParamsToggle;
      const cleaningMode = cleaningSelect.getAttribute("data-value");

      trackCopy({
        format: "markdown",
        source: "popup",
        success: true,
        duration,
        urlCleaning: cleaningMode !== undefined ? cleaningMode : null,
        templateId: null,
        templateName: null,
        shortService: null,
        errorType: null,
        errorMessage: null,
      }).catch((error) => {
        console.debug("Failed to track markdown copy event:", error);
      });

      toast.success(getLocalMessage("markdownCopied"));
    } catch (error) {
      console.debug("Markdown复制失败:", error);
      let fallbackSuccess = false;

      // 使用fallback复制方法
      try {
        const markdownLink = createMarkdownLink(currentUrl, currentTitle);
        fallbackCopy(markdownLink);
        fallbackSuccess = true;
        toast.success(getLocalMessage("markdownCopied"));
      } catch (fallbackError) {
        console.debug("Markdown降级复制也失败:", fallbackError);
      }

      // 记录复制事件（成功或失败）
      const duration = Date.now() - startTime;
      const cleaningSelect = elements.removeParamsToggle;
      const cleaningMode = cleaningSelect.getAttribute("data-value");

      trackCopy({
        format: "markdown",
        source: "popup",
        success: fallbackSuccess,
        duration,
        urlCleaning: cleaningMode !== undefined ? cleaningMode : null,
        templateId: null,
        templateName: null,
        shortService: null,
        errorType: fallbackSuccess ? null : "clipboard",
        errorMessage: fallbackSuccess ? null : error.message,
      }).catch((trackError) => {
        console.debug("Failed to track markdown copy event:", trackError);
      });
    } finally {
      // 300ms后重置状态
      setTimeout(() => {
        copyOperationStates.copyMarkdown = false;
      }, 300);
    }
  }

  // 生成短链 - simplified using getOrGenerateShortUrl
  async function generateShortUrl() {
    // Prevent duplicate execution
    if (copyOperationStates.generateShortUrl) {
      return;
    }

    if (!currentUrl) {
      toast.warning(getLocalMessage("noUrl") || "No URL available");
      return;
    }

    // Validate URL is suitable for shortening
    if (!isValidWebUrl(currentUrl)) {
      toast.warning(
        getLocalMessage("invalidUrlForShortening") ||
          "This URL cannot be shortened",
      );
      return;
    }

    copyOperationStates.generateShortUrl = true;
    const startTime = Date.now();

    // Show loading state
    const originalText = elements.shortUrlBtn.querySelector("span").textContent;
    const loadingText = getLocalMessage("generating") || "Generating...";
    elements.shortUrlBtn.querySelector("span").textContent = loadingText;
    elements.shortUrlBtn.disabled = true;

    try {
      // Get settings
      const result = await chrome.storage.sync.get(["shortUrlService"]);
      const selectedService = result.shortUrlService || "isgd";

      const cleaningSelect = elements.removeParamsToggle;
      const cleaningMode = cleaningSelect.getAttribute("data-value");

      // Use unified helper function - handles caching, cleaning, generation
      const shortUrl = await getOrGenerateShortUrl(
        currentUrl,
        cleaningMode,
        selectedService,
      );

      // Copy to clipboard
      let copySuccess = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shortUrl);
          copySuccess = true;
        } else {
          fallbackCopy(shortUrl);
          copySuccess = true;
        }
      } catch (error) {
        console.debug("短链复制失败:", error);
      }

      // Track copy event
      trackCopy({
        format: "shortUrl",
        source: "popup",
        success: copySuccess,
        duration: Date.now() - startTime,
        urlCleaning: null,
        templateId: null,
        templateName: null,
        shortService: selectedService !== undefined ? selectedService : null,
        errorType: copySuccess ? null : "clipboard",
        errorMessage: copySuccess ? null : "Copy failed",
      }).catch((error) => {
        console.debug("Failed to track shortUrl copy:", error);
      });

      // Show success notification
      const serviceName =
        SHORT_URL_SERVICES[selectedService]?.name || selectedService;
      toast.success(
        getLocalMessage("shortUrlGenerated") ||
          `Short URL generated and copied! (${serviceName})`,
      );
    } catch (error) {
      console.debug("生成短链失败:", error);
      toast.error(
        getLocalMessage("shortUrlFailed") || "Failed to generate short URL",
      );
    } finally {
      // Restore button state
      elements.shortUrlBtn.querySelector("span").textContent = originalText;
      elements.shortUrlBtn.disabled = false;

      setTimeout(() => {
        copyOperationStates.generateShortUrl = false;
      }, 1000);
    }
  }

  // 显示复制成功状态
  async function showStatus() {
    // 显示toast通知
    toast.success(getLocalMessage("urlCopied"));
  }

  // 复制二维码图片到剪贴板
  async function copyQRCodeImage() {
    if (copyOperationStates.copyQRCode) {
      return; // 防止重复执行
    }

    copyOperationStates.copyQRCode = true;
    const startTime = Date.now();

    try {
      const canvas = elements.qrCodeContainer.querySelector("canvas");
      if (!canvas) {
        throw new Error("未找到二维码canvas元素");
      }

      // 将canvas转换为blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error("无法生成二维码图片");
        }

        try {
          // 使用现代clipboard API复制图片
          if (navigator.clipboard && navigator.clipboard.write) {
            const clipboardItem = new ClipboardItem({ "image/png": blob });
            await navigator.clipboard.write([clipboardItem]);

            // 记录成功的QR码复制事件
            const duration = Date.now() - startTime;
            trackCopy({
              format: "qrcode",
              source: "popup",
              success: true,
              duration,
              urlCleaning: null,
              templateId: null,
              templateName: null,
              shortService: null,
              errorType: null,
              errorMessage: null,
            }).catch((error) => {
              console.debug("Failed to track QR code copy:", error);
            });

            // 复制成功后立即关闭二维码模态框
            hideQRModal();

            // 关闭弹窗后显示成功通知
            setTimeout(() => {
              toast.success(
                getLocalMessage("qrCodeCopied") || "二维码图片已复制",
              );
            }, 200);
          } else {
            throw new Error("浏览器不支持图片复制功能");
          }
        } catch (error) {
          console.debug("复制二维码图片失败:", error);

          // 记录失败的QR码复制事件
          const duration = Date.now() - startTime;
          trackCopy({
            format: "qrcode",
            source: "popup",
            success: false,
            duration,
            urlCleaning: null,
            templateId: null,
            templateName: null,
            shortService: null,
            errorType: "clipboard",
            errorMessage: error.message,
          }).catch((trackError) => {
            console.debug("Failed to track QR code copy error:", trackError);
          });

          toast.error(
            getLocalMessage("qrCodeCopyFailed") || "二维码图片复制失败",
          );
        } finally {
          // 重置状态
          setTimeout(() => {
            copyOperationStates.copyQRCode = false;
          }, 300);
        }
      }, "image/png");
    } catch (error) {
      console.debug("处理二维码图片失败:", error);
      toast.error(getLocalMessage("qrCodeCopyFailed") || "二维码图片复制失败");
      // 重置状态
      setTimeout(() => {
        copyOperationStates.copyQRCode = false;
      }, 300);
    }
  }

  // 生成二维码
  function generateQRCode(url) {
    // 清空容器
    elements.qrCodeContainer.innerHTML = "";

    // 根据当前主题选择二维码颜色
    const isDarkTheme =
      document.documentElement.getAttribute("data-theme") === "dark" ||
      (document.documentElement.getAttribute("data-theme") !== "light" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    // 创建二维码
    new QRCode(elements.qrCodeContainer, {
      text: url,
      width: 200,
      height: 200,
      colorDark: isDarkTheme ? "#f1f5f9" : "#000000",
      colorLight: isDarkTheme ? "#1e293b" : "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });

    // 显示URL
    elements.qrUrlDisplay.textContent = url;
  }

  // 显示二维码模态框
  async function showQRModal() {
    const cleaningSelect = elements.removeParamsToggle;
    const cleaningMode = cleaningSelect.getAttribute("data-value");
    const processedUrl = await processUrl(currentUrl, cleaningMode);

    generateQRCode(processedUrl);
    elements.qrModal.classList.add("show");
  }

  // 隐藏二维码模态框
  function hideQRModal() {
    elements.qrModal.classList.remove("show");
  }

  // 初始化二维码模态框事件
  function initializeQRModal() {
    // 点击关闭按钮
    elements.qrModalClose.addEventListener("click", hideQRModal);

    // 点击遮罩层关闭
    elements.qrModalOverlay.addEventListener("click", hideQRModal);

    // 按ESC键关闭
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && elements.qrModal.classList.contains("show")) {
        hideQRModal();
      }
    });
  }

  // 打开批量复制页面
  function openBatchCopyPage() {
    chrome.tabs.create({
      url: chrome.runtime.getURL("pages/batch/batch.html"),
    });
  }

  // 事件监听器
  elements.copyBtn.addEventListener("click", copyUrl);
  elements.markdownBtn.addEventListener("click", copyMarkdown);
  elements.shortUrlBtn.addEventListener("click", generateShortUrl);
  elements.qrBtn.addEventListener("click", showQRModal);
  elements.batchBtn.addEventListener("click", openBatchCopyPage);
  elements.qrCopyBtn.addEventListener("click", copyQRCodeImage);

  elements.silentCopyFormat.addEventListener(
    "change",
    handleSilentCopyFormatChange,
  );

  // 更多设置按钮事件
  elements.moreSettingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // 键盘快捷键
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "c" && !e.shiftKey) {
      e.preventDefault();
      copyUrl();
    }
  });

  // 优化后的并行初始化流程
  console.time("Popup initialization");

  // 同步操作 - 不需要等待
  loadVersion(); // Load version from manifest
  const urlCleaningSwitch = initializeUrlCleaningSelect();
  initializeQRModal(); // Initialize QR modal
  setupTemplateChangeListener(); // 设置模板变更监听器

  try {
    // 并行执行所有异步初始化操作
    const [, urlResult] = await Promise.all([
      // 设置相关的并行操作
      (async () => {
        const settings = await loadSettings();

        // 在获取到设置后，并行执行依赖设置的操作
        const [templateResult, i18nResult] = await Promise.all([
          loadCustomTemplates(settings.silentCopyFormat),
          initializeI18n({
            locale: settings.allSettings.language,
            updateDOM: true,
          }),
        ]);

        return { settings, templateResult, i18nResult };
      })(),

      // 获取当前URL数据（独立操作，可以并行）
      getCurrentUrlData(),
    ]);

    // 所有数据加载完成后，统一更新UI
    if (urlResult.success) {
      currentUrl = urlResult.url;
      currentTitle = urlResult.title;
      updatePageDisplay();
    } else {
      handleError(urlResult.error);
    }

    console.timeEnd("Popup initialization");

    // 在所有初始化完成后，重新计算滑块位置
    requestAnimationFrame(() => {
      if (urlCleaningSwitch && urlCleaningSwitch.updateSliderPosition) {
        urlCleaningSwitch.updateSliderPosition();
      }
    });
  } catch (error) {
    console.debug("Popup initialization failed:", error);
    console.timeEnd("Popup initialization");

    // 即使出错也要确保基本功能可用
    try {
      const urlResult = await getCurrentUrlData();
      if (urlResult.success) {
        currentUrl = urlResult.url;
        currentTitle = urlResult.title;
        updatePageDisplay();
      } else {
        handleError(urlResult.error);
      }
    } catch {
      handleError("Failed to initialize popup");
    }
  }
});
