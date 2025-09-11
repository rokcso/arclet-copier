document.addEventListener("DOMContentLoaded", async () => {
  const urlDisplay = document.getElementById("urlDisplay");
  const copyBtn = document.getElementById("copyBtn");
  const status = document.getElementById("status");
  const removeParamsToggle = document.getElementById("removeParamsToggle");

  let currentUrl = "";

  // 加载设置
  async function loadSettings() {
    const result = await chrome.storage.sync.get(["removeParams"]);
    removeParamsToggle.checked = result.removeParams || false;
  }

  // 保存设置
  async function saveSettings() {
    await chrome.storage.sync.set({
      removeParams: removeParamsToggle.checked,
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
        urlDisplay.textContent = "无法获取 URL";
        copyBtn.disabled = true;
      }
    } catch (error) {
      console.error("获取 URL 失败:", error);
      urlDisplay.textContent = "获取 URL 失败";
      copyBtn.disabled = true;
    }
  }

  // 更新URL显示
  function updateUrlDisplay() {
    const processedUrl = processUrl(currentUrl, removeParamsToggle.checked);
    urlDisplay.textContent = processedUrl;
  }

  // 复制URL到剪贴板
  async function copyUrl() {
    try {
      const processedUrl = processUrl(currentUrl, removeParamsToggle.checked);

      // 直接使用clipboard API（popup环境下有用户手势，应该可以工作）
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(processedUrl);
        console.log("Popup clipboard API copy successful");
      } else {
        throw new Error("Clipboard API not available");
      }

      showStatus();
    } catch (error) {
      console.error("复制失败:", error);
      // 降级处理：使用execCommand方法
      try {
        const processedUrl = processUrl(currentUrl, removeParamsToggle.checked);

        const textArea = document.createElement("textarea");
        textArea.value = processedUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        textArea.setAttribute("readonly", "");
        document.body.appendChild(textArea);

        textArea.select();
        textArea.setSelectionRange(0, 99999);

        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);

        if (successful) {
          showStatus();
          console.log("Popup execCommand copy successful");
        } else {
          throw new Error("execCommand copy failed");
        }
      } catch (fallbackError) {
        console.error("降级复制也失败:", fallbackError);
      }
    }
  }

  // 显示复制成功状态
  function showStatus() {
    // 使用Chrome通知API显示全局通知
    try {
      chrome.notifications.create(
        {
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "Arclet Copier",
          message: "URL 已复制到剪贴板！",
        },
        (notificationId) => {
          if (chrome.runtime.lastError) {
            console.error("通知创建失败:", chrome.runtime.lastError);
            // 降级到原来的状态提示
            status.classList.add("show");
            setTimeout(() => {
              status.classList.remove("show");
            }, 1500);
          } else {
            console.log("通知创建成功:", notificationId);
          }
        },
      );
    } catch (error) {
      console.error("通知 API 调用失败:", error);
      // 降级到原来的状态提示
      status.classList.add("show");
      setTimeout(() => {
        status.classList.remove("show");
      }, 1500);
    }
  }

  // 事件监听器
  copyBtn.addEventListener("click", copyUrl);

  removeParamsToggle.addEventListener("change", () => {
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
