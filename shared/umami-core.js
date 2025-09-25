// Umami 分析核心 - 通用上报引擎

// ===== 配置 =====
const UMAMI_CONFIG = {
  websiteId: "c0b57f97-5293-42d9-8ec2-4708e4ea68ae",
  apiUrl: "https://umami.lunarye.com",
};

// ===== 核心事件发送方法 =====

/**
 * 统一的事件发送方法
 * 自动添加公共属性：user_id, timestamp, date, platform, browser, version
 * @param {string} eventName - 事件名称
 * @param {Object} customProperties - 自定义事件属性
 * @returns {Promise<boolean>} - 发送是否成功
 */
export async function sendEvent(eventName, customProperties = {}) {
  try {
    // 获取或生成用户 ID
    const userId = await getUserId();

    // 获取当前时间
    const now = new Date();
    const timestamp = now.getTime(); // Unix timestamp in milliseconds
    const isoString = now.toISOString();
    const timeString = isoString.split("T")[1].split(".")[0]; // HH:MM:SS format
    const dateString = isoString.split("T")[0]; // YYYY-MM-DD format

    // 合并公共属性和自定义属性到 data 字段
    const eventData = {
      $user_id: userId,
      $timestamp: timestamp,
      $time: timeString,
      $date: dateString,
      $platform: getPlatform(),
      $browser: getBrowser(),
      $version: chrome.runtime.getManifest().version,
      ...customProperties, // 自定义属性可以覆盖公共属性
    };

    // 构建 Umami 标准格式
    const payload = {
      type: "event",
      payload: {
        website: UMAMI_CONFIG.websiteId,
        hostname: chrome.runtime.id,
        name: eventName,
        language: chrome.i18n.getUILanguage(),
        data: eventData,
      },
    };

    // 发送到 Umami
    return await sendToUmami(payload, eventName);
  } catch (error) {
    console.error(`Error sending event "${eventName}":`, error);
    return false;
  }
}

// ===== 内部方法 =====

// 发送数据到 Umami API
async function sendToUmami(payload, eventName) {
  const endpoint = `${UMAMI_CONFIG.apiUrl}/api/send`;
  const payloadString = JSON.stringify(payload);

  try {
    // 优先使用 navigator.sendBeacon（更可靠，特别是在页面卸载时）
    if (navigator.sendBeacon) {
      // 使用 Blob 确保正确的 Content-Type
      const blob = new Blob([payloadString], {
        type: "application/json",
      });

      const success = navigator.sendBeacon(endpoint, blob);
      if (success) {
        console.log(`Event "${eventName}" sent successfully via sendBeacon`);
        return true;
      } else {
        console.warn(
          `sendBeacon failed for event "${eventName}", falling back to fetch`,
        );
      }
    }

    // 回退到 fetch + keepalive
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Arclet-Copier-Extension",
      },
      body: payloadString,
      keepalive: true,
      mode: "cors",
    });

    if (response.ok) {
      console.log(`Event "${eventName}" sent successfully via fetch`);
      return true;
    } else {
      console.warn(`Failed to send event "${eventName}":`, response.status);
      return false;
    }
  } catch (fetchError) {
    console.error(
      `Both sendBeacon and fetch failed for event "${eventName}":`,
      fetchError,
    );
    return false;
  }
}

// 用户 ID 管理
async function getUserId() {
  try {
    const result = await chrome.storage.local.get(["analytics_user_id"]);
    if (result.analytics_user_id) {
      return result.analytics_user_id;
    }

    // 生成新的用户 ID
    const newUserId = generateUserId();
    await chrome.storage.local.set({ analytics_user_id: newUserId });
    console.log("Generated new user ID:", newUserId);
    return newUserId;
  } catch (error) {
    console.error("Failed to get/generate user ID:", error);
    return generateUserId(); // 返回临时 ID
  }
}

function generateUserId() {
  const nanoTime = performance.now().toString(36).replace(".", "");
  const random = Math.random().toString(36).substr(2, 8);
  const timePart = nanoTime.slice(-6);
  const randomPart = random.slice(0, 6);
  return `user_${randomPart}${timePart}`;
}

// 环境检测
function getBrowser() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("edg/")) return "edge";
  if (userAgent.includes("chrome/")) return "chrome";
  if (userAgent.includes("firefox/")) return "firefox";
  return "unknown";
}

function getPlatform() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac")) return "mac";
  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("linux")) return "linux";
  return "unknown";
}
