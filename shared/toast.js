// Toast通知管理器 - Arc风格，防重复显示
class ToastManager {
  constructor() {
    this.container = null;
    this.toastCount = 0;
    this.maxToasts = 5; // 最多同时显示5个toast
    this.activeToasts = new Map(); // 存储当前活跃的toast，防重复
  }

  // 确保容器存在
  ensureContainer() {
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "arclet-toast-container";
      this.container.className = "toast-container";
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  // 显示toast - Arc风格防重复
  show(message, type = "info", options = {}) {
    const {
      duration = 2000, // 改为2秒自动消失
      title = null,
      closable = false, // Arc风格默认不显示关闭按钮
    } = options;

    // 创建消息的唯一标识符
    const messageKey = `${type}:${message}`;

    // 如果相同消息的toast已存在，延长其显示时间而不是创建新的
    if (this.activeToasts.has(messageKey)) {
      const existingToast = this.activeToasts.get(messageKey);

      // 清除现有的自动关闭定时器
      if (existingToast.timeoutId) {
        clearTimeout(existingToast.timeoutId);
      }

      // 重新设置自动关闭定时器
      if (duration > 0) {
        existingToast.timeoutId = setTimeout(() => {
          this.closeToast(existingToast.element);
        }, duration);
      }

      return existingToast.element.id;
    }

    // 限制toast数量
    if (this.toastCount >= this.maxToasts) {
      this.removeOldestToast();
    }

    const container = this.ensureContainer();
    const toast = this.createToast(message, type, title, closable, duration);

    container.appendChild(toast);
    this.toastCount++;

    // 记录活跃的toast
    const toastInfo = {
      element: toast,
      timeoutId: null,
      messageKey: messageKey,
    };
    this.activeToasts.set(messageKey, toastInfo);

    // 入场动画
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    // 自动关闭
    if (duration > 0) {
      toastInfo.timeoutId = setTimeout(() => {
        this.closeToast(toast);
      }, duration);
    }

    return toast.id;
  }

  // 创建toast元素
  createToast(message, type, title, closable, duration) {
    const toast = document.createElement("div");
    const id =
      "toast-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
    toast.id = id;
    toast.className = `toast toast-${type}`;

    // Arc风格不需要这些变量

    // Arc风格只显示简单的消息内容，不需要图标、标题和关闭按钮
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-text">
          <div class="toast-message">${this.escapeHtml(message)}</div>
        </div>
      </div>
    `;

    return toast;
  }

  // 关闭toast
  closeToast(toast) {
    if (!toast || !toast.parentNode) return;

    // 查找并清理对应的活跃toast记录
    for (const [messageKey, toastInfo] of this.activeToasts.entries()) {
      if (toastInfo.element === toast) {
        // 清除定时器
        if (toastInfo.timeoutId) {
          clearTimeout(toastInfo.timeoutId);
        }
        // 从活跃toast记录中移除
        this.activeToasts.delete(messageKey);
        break;
      }
    }

    toast.classList.add("hiding");

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
        this.toastCount--;

        // 如果没有toast了，移除容器
        if (this.toastCount <= 0 && this.container) {
          this.container.remove();
          this.container = null;
          this.toastCount = 0;
        }
      }
    }, 300); // 与CSS动画时间匹配
  }

  // 移除最旧的toast
  removeOldestToast() {
    if (!this.container) return;

    const oldestToast = this.container.querySelector(".toast");
    if (oldestToast) {
      this.closeToast(oldestToast);
    }
  }

  // 清空所有toast
  clear() {
    if (!this.container) return;

    // 清除所有定时器
    for (const toastInfo of this.activeToasts.values()) {
      if (toastInfo.timeoutId) {
        clearTimeout(toastInfo.timeoutId);
      }
    }

    // 清空活跃toast记录
    this.activeToasts.clear();

    const toasts = this.container.querySelectorAll(".toast");
    toasts.forEach((toast) => this.closeToast(toast));
  }

  // Arc风格不需要图标，保留此函数以保持兼容性
  getTypeIcon(type) {
    return "";
  }

  // HTML转义
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // 便捷方法
  success(message, options) {
    return this.show(message, "success", options);
  }

  error(message, options) {
    return this.show(message, "error", options);
  }

  warning(message, options) {
    return this.show(message, "warning", options);
  }

  info(message, options) {
    return this.show(message, "info", options);
  }
}

// 创建全局实例
const toast = new ToastManager();

export default toast;
