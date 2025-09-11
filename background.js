// Background script for handling keyboard shortcuts and URL copying

// 监听键盘快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "copy-url") {
    await handleCopyUrl();
  }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "copyFromPopup") {
    copyToClipboard(message.text)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Popup copy failed:", error);
        sendResponse({ success: false, error: error.message });
      });

    // 返回true表示会异步发送响应
    return true;
  }
});

// 处理URL复制功能
async function handleCopyUrl() {
  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab || !tab.url) {
      console.error("无法获取当前标签页 URL");
      showNotification("Arclet Copier", "无法获取当前页面 URL");
      return;
    }

    // 获取用户设置
    const settings = await chrome.storage.sync.get(["removeParams"]);
    const removeParams = settings.removeParams || false;

    // 处理URL
    const processedUrl = processUrl(tab.url, removeParams);

    // 复制到剪贴板 - 使用offscreen document
    await copyToClipboard(processedUrl);

    // 显示成功通知
    showNotification("Arclet Copier", "URL 已复制到剪贴板！");
  } catch (error) {
    console.error("复制 URL 失败:", error);
    showNotification("Arclet Copier", "复制失败，请重试");
  }
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
    console.error("URL 处理失败:", error);
    return url;
  }
}

// 复制到剪贴板 - 使用content script注入
async function copyToClipboard(text) {
  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab || !tab.id) {
      throw new Error("无法获取当前标签页");
    }

    // 注入简单的复制脚本
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (textToCopy) => {
        try {
          // 创建textarea元素
          const textarea = document.createElement("textarea");
          textarea.value = textToCopy;
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          textarea.style.top = "-9999px";
          textarea.style.opacity = "0";
          textarea.setAttribute("readonly", "");
          document.body.appendChild(textarea);

          // 选择并复制
          textarea.select();
          textarea.setSelectionRange(0, 99999);

          const success = document.execCommand("copy");
          document.body.removeChild(textarea);

          if (!success) {
            throw new Error("execCommand failed");
          }

          return true;
        } catch (error) {
          console.error("Content script copy failed:", error);
          throw error;
        }
      },
      args: [text],
    });

    console.log("Content script copy successful");
  } catch (error) {
    console.error("Content script 复制失败:", error);
    throw error;
  }
}

// 显示通知
function showNotification(title, message) {
  chrome.notifications.create(
    {
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: title,
      message: message,
    },
    (notificationId) => {
      if (chrome.runtime.lastError) {
        console.error("通知创建失败:", chrome.runtime.lastError);
      }
    },
  );
}
