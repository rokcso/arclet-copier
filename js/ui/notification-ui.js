// 通知UI组件

export class NotificationUI {
  constructor() {
    this.statusElement = document.getElementById("status");
  }

  // 显示Arc风格的状态通知
  showArcNotification(message) {
    if (!this.statusElement) return;

    const textElement = this.statusElement.querySelector(".notification-text");
    if (textElement) {
      textElement.textContent = message;
    }
    this.statusElement.classList.add("show");

    setTimeout(() => {
      this.statusElement.classList.remove("show");
    }, 2000);
  }

  // 显示系统通知
  showSystemNotification(title, message) {
    try {
      const notificationOptions = {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon48.png"),
        title: title,
        message: message,
      };

      console.log("Popup 创建通知，图标路径:", notificationOptions.iconUrl);

      chrome.notifications.create(notificationOptions, (notificationId) => {
        if (chrome.runtime.lastError) {
          console.error(
            "通知创建失败:",
            chrome.runtime.lastError.message || chrome.runtime.lastError,
          );
        } else {
          console.log("通知创建成功:", notificationId);
        }
      });
    } catch (error) {
      console.error("通知 API 调用失败:", error);
    }
  }
}

// 全局通知函数，供其他模块使用
if (typeof window !== "undefined") {
  const notificationUI = new NotificationUI();
  window.showArcNotification = (message) =>
    notificationUI.showArcNotification(message);
  window.showSystemNotification = (title, message) =>
    notificationUI.showSystemNotification(title, message);
}
