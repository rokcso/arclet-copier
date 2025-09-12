// Offscreen document for clipboard operations
// 根据最新的 Chrome 扩展 Manifest V3 最佳实践

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "copy") {
    handleClipboardWrite(message.text)
      .then(() => {
        console.log("Offscreen copy successful");
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Offscreen copy failed:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 表示会异步发送响应
  }
});

async function handleClipboardWrite(data) {
  try {
    if (typeof data !== "string") {
      throw new TypeError(
        `Value provided must be a 'string', got '${typeof data}'.`,
      );
    }

    const textEl = document.querySelector("#text");
    if (!textEl) {
      throw new Error("Text element not found");
    }

    // 设置文本内容
    textEl.value = data;

    // 选择文本
    textEl.select();
    textEl.setSelectionRange(0, textEl.value.length);

    // 使用 execCommand 复制（这是在 offscreen document 中唯一可靠的方法）
    const success = document.execCommand("copy");

    if (!success) {
      throw new Error("execCommand copy failed");
    }

    console.log("Clipboard copy successful using execCommand");
  } catch (error) {
    console.error("Clipboard copy error:", error);
    throw error;
  }
}
