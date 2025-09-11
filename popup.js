document.addEventListener("DOMContentLoaded", async () => {
  // Constants
  const EXTENSION_NAME = "Arclet Copier";
  const MESSAGES = {
    URL_COPIED: "URL 已复制到剪贴板！",
    NO_URL: "无法获取 URL",
    GET_URL_FAILED: "获取 URL 失败",
    LOADING: "获取 URL 中...",
  };

  // DOM elements
  const elements = {
    urlDisplay: document.getElementById("urlDisplay"),
    copyBtn: document.getElementById("copyBtn"),
    status: document.getElementById("status"),
    removeParamsToggle: document.getElementById("removeParamsToggle"),
  };

  let currentUrl = "";

  // 加载设置
  async function loadSettings() {
    const result = await chrome.storage.sync.get(["removeParams"]);
    elements.removeParamsToggle.checked = result.removeParams || false;
  }

  // 保存设置
  async function saveSettings() {
    await chrome.storage.sync.set({
      removeParams: elements.removeParamsToggle.checked,
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

  // 获取当前页面URL
  async function getCurrentUrl() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab && tab.url) {
        currentUrl = tab.url;
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
      try {
        fallbackCopy(processedUrl);
        showStatus();
      } catch (fallbackError) {
        console.error("降级复制也失败:", fallbackError);
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

  // 显示复制成功状态
  function showStatus() {
    try {
      createNotification();
    } catch (error) {
      console.error("通知 API 调用失败:", error);
      showLocalStatus();
    }
  }

  // 事件监听器
  elements.copyBtn.addEventListener("click", copyUrl);

  elements.removeParamsToggle.addEventListener("change", () => {
    saveSettings();
    updateUrlDisplay();
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
