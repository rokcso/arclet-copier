// Toast通知管理器 - 简化版本，专注于基础功能
class ToastManager {
  constructor() {
    this.container = null;
    this.toastCount = 0;
    this.maxToasts = 5; // 最多同时显示5个toast
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

  // 显示toast
  show(message, type = "info", options = {}) {
    const { duration = 3000, title = null, closable = true } = options;

    // 限制toast数量
    if (this.toastCount >= this.maxToasts) {
      this.removeOldestToast();
    }

    const container = this.ensureContainer();
    const toast = this.createToast(message, type, title, closable, duration);

    container.appendChild(toast);
    this.toastCount++;

    // 入场动画
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    // 自动关闭
    if (duration > 0) {
      setTimeout(() => {
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
