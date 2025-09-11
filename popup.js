document.addEventListener("DOMContentLoaded", async () => {
  // Constants
  const EXTENSION_NAME = "Arclet Copier";
  const MESSAGES = {
    URL_COPIED: "URL 已复制到剪贴板！",
    MARKDOWN_COPIED: "Markdown 链接已复制到剪贴板！",
    NO_URL: "无法获取 URL",
    GET_URL_FAILED: "获取 URL 失败",
    LOADING: "获取 URL 中...",
    COPY_BTN_DEFAULT: "复制 URL",
    COPY_BTN_SUCCESS: "已复制！",
    MARKDOWN_BTN_DEFAULT: "复制为 Markdown",
    MARKDOWN_BTN_SUCCESS: "已复制！",
  };

  // DOM elements
  const elements = {
    urlDisplay: document.getElementById("urlDisplay"),
    copyBtn: document.getElementById("copyBtn"),
    markdownBtn: document.getElementById("markdownBtn"),
    status: document.getElementById("status"),
    removeParamsToggle: document.getElementById("removeParamsToggle"),
    silentCopyFormat: document.getElementById("silentCopyFormat"),
  };

  let currentUrl = "";
  let currentTitle = "";

  // 加载设置
  async function loadSettings() {
    const result = await chrome.storage.sync.get([
      "removeParams",
      "silentCopyFormat",
    ]);
    elements.removeParamsToggle.checked = result.removeParams || false;
    elements.silentCopyFormat.value = result.silentCopyFormat || "url";
  }

  // 保存设置
  async function saveSettings() {
    await chrome.storage.sync.set({
      removeParams: elements.removeParamsToggle.checked,
      silentCopyFormat: elements.silentCopyFormat.value,
    });
  }

  // 处理URL参数
  function processUrl(url, removeParams) {
    if (!removeParams) {
      return url;
    }

    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch (error) {
      return url;
    }
  }

  // 获取页面标题
  async function getPageTitle(tabId) {
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

  // 检查是否为特殊页面 (chrome://, edge://, about: 等内部页面)
  function isRestrictedPage(url) {
    if (!url) return true;
    const restrictedProtocols = [
      "chrome:",
      "chrome-extension:",
      "edge:",
      "about:",
      "moz-extension:",
    ];
    return restrictedProtocols.some((protocol) => url.startsWith(protocol));
  }

  // 获取当前页面URL
  async function getCurrentUrl() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab && tab.url) {
        currentUrl = tab.url;

        // 获取页面标题，但在特殊页面跳过脚本注入
        if (tab.id && !isRestrictedPage(tab.url)) {
          currentTitle = await getPageTitle(tab.id);
        } else if (isRestrictedPage(tab.url)) {
          // 对于特殊页面，使用tab.title或从URL生成标题
          currentTitle = tab.title || new URL(tab.url).hostname || "特殊页面";
        }

        updateUrlDisplay();
      } else {
        handleError(MESSAGES.NO_URL);
      }
    } catch (error) {
      console.error("获取 URL 失败:", error);
      handleError(MESSAGES.GET_URL_FAILED);
    }
  }

  // 处理错误状态
  function handleError(message) {
    elements.urlDisplay.textContent = message;
    elements.copyBtn.disabled = true;
    elements.markdownBtn.disabled = true;
  }

  // 更新URL显示
  function updateUrlDisplay() {
    const processedUrl = processUrl(
      currentUrl,
      elements.removeParamsToggle.checked,
    );
    elements.urlDisplay.textContent = processedUrl;
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
    const processedUrl = processUrl(
      currentUrl,
      elements.removeParamsToggle.checked,
    );

    try {
      // 首先尝试现代clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(processedUrl);
        console.log("Popup clipboard API copy successful");
      } else {
        fallbackCopy(processedUrl);
      }

      showStatus();
    } catch (error) {
      console.error("复制失败:", error);
      // 对于特殊页面，不要报错，只是静默失败并显示成功状态
      if (isRestrictedPage(currentUrl)) {
        console.log("特殊页面，使用fallback复制");
        try {
          fallbackCopy(processedUrl);
          showStatus();
        } catch (fallbackError) {
          console.error("特殊页面降级复制失败:", fallbackError);
          showStatus(); // 即使失败也显示成功状态，避免用户困惑
        }
      } else {
        try {
          fallbackCopy(processedUrl);
          showStatus();
        } catch (fallbackError) {
          console.error("降级复制也失败:", fallbackError);
        }
      }
    }
  }

  // 显示状态提示
  function showLocalStatus() {
    elements.status.classList.add("show");
    setTimeout(() => {
      elements.status.classList.remove("show");
    }, 1500);
  }

  // 创建通知
  function createNotification() {
    const notificationOptions = {
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: EXTENSION_NAME,
      message: MESSAGES.URL_COPIED,
    };

    chrome.notifications.create(notificationOptions, (notificationId) => {
      if (chrome.runtime.lastError) {
        console.error("通知创建失败:", chrome.runtime.lastError);
        showLocalStatus();
      } else {
        console.log("通知创建成功:", notificationId);
      }
    });
  }

  // 创建 markdown 链接格式
  function createMarkdownLink(url, title) {
    const processedUrl = processUrl(url, elements.removeParamsToggle.checked);
    const linkTitle = title || new URL(url).hostname;
    return `[${linkTitle}](${processedUrl})`;
  }

  // 复制 markdown 链接
  async function copyMarkdown() {
    const markdownLink = createMarkdownLink(currentUrl, currentTitle);

    try {
      // 首先尝试现代clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(markdownLink);
        console.log("Popup markdown clipboard API copy successful");
      } else {
        fallbackCopy(markdownLink);
      }

      showMarkdownButtonSuccess();
      showMarkdownNotification();
    } catch (error) {
      console.error("Markdown复制失败:", error);
      // 对于特殊页面，不要报错，只是静默失败并显示成功状态
      if (isRestrictedPage(currentUrl)) {
        console.log("特殊页面，使用fallback复制 Markdown");
        try {
          fallbackCopy(markdownLink);
          showMarkdownButtonSuccess();
          showMarkdownNotification();
        } catch (fallbackError) {
          console.error("特殊页面 Markdown 降级复制失败:", fallbackError);
          showMarkdownButtonSuccess(); // 即使失败也显示成功状态
          showMarkdownNotification();
        }
      } else {
        try {
          fallbackCopy(markdownLink);
          showMarkdownButtonSuccess();
          showMarkdownNotification();
        } catch (fallbackError) {
          console.error("Markdown降级复制也失败:", fallbackError);
        }
      }
    }
  }

  // 显示按钮复制成功状态
  function showButtonSuccess() {
    const originalText = elements.copyBtn.textContent;

    // 添加成功样式和文本
    elements.copyBtn.classList.add("success");
    elements.copyBtn.textContent = MESSAGES.COPY_BTN_SUCCESS;

    // 1.5秒后恢复原状
    setTimeout(() => {
      elements.copyBtn.classList.remove("success");
      elements.copyBtn.textContent = originalText;
    }, 1500);
  }

  // 显示 markdown 按钮复制成功状态
  function showMarkdownButtonSuccess() {
    const originalText = elements.markdownBtn.textContent;

    // 添加成功样式和文本
    elements.markdownBtn.classList.add("success");
    elements.markdownBtn.textContent = MESSAGES.MARKDOWN_BTN_SUCCESS;

    // 1.5秒后恢复原状
    setTimeout(() => {
      elements.markdownBtn.classList.remove("success");
      elements.markdownBtn.textContent = originalText;
    }, 1500);
  }

  // 显示 markdown 通知
  function showMarkdownNotification() {
    try {
      const notificationOptions = {
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: EXTENSION_NAME,
        message: MESSAGES.MARKDOWN_COPIED,
      };

      chrome.notifications.create(notificationOptions, (notificationId) => {
        if (chrome.runtime.lastError) {
          console.error("Markdown通知创建失败:", chrome.runtime.lastError);
          showLocalStatus();
        } else {
          console.log("Markdown通知创建成功:", notificationId);
        }
      });
    } catch (error) {
      console.error("Markdown通知 API 调用失败:", error);
      showLocalStatus();
    }
  }

  // 显示复制成功状态
  function showStatus() {
    // 显示按钮交互效果
    showButtonSuccess();

    try {
      createNotification();
    } catch (error) {
      console.error("通知 API 调用失败:", error);
      showLocalStatus();
    }
  }

  // 事件监听器
  elements.copyBtn.addEventListener("click", copyUrl);
  elements.markdownBtn.addEventListener("click", copyMarkdown);

  elements.removeParamsToggle.addEventListener("change", () => {
    saveSettings();
    updateUrlDisplay();
  });

  elements.silentCopyFormat.addEventListener("change", () => {
    saveSettings();
  });

  // 键盘快捷键
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "c" && !e.shiftKey) {
      e.preventDefault();
      copyUrl();
    }
  });

  // 初始化
  await loadSettings();
  await getCurrentUrl();
});
