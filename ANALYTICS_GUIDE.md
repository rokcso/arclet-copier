# Arclet Copier 分析功能使用指南

## 功能概述

已为 Arclet Copier 扩展集成了基础的用户统计分析功能，目前实现了**累计用户统计**。

## 当前功能

### 累计用户统计
- 自动记录扩展的新安装用户
- 每个用户只记录一次，避免重复统计
- 数据发送到指定的 Umami 分析服务器

## 技术实现

### 事件类型
- **事件名称**: `user_install`
- **触发时机**: 扩展首次安装时
- **数据内容**:
  ```json
  {
    "event": "user_install",
    "data": {
      "user_id": "user_1704067200_abc123",
      "version": "1.6.0",
      "install_type": "install",
      "install_date": "2024-01-01", 
      "browser": "chrome",
      "platform": "mac",
      "locale": "zh_CN",
      "timestamp": 1704067200000
    }
  }
  ```

### 数据发送方式
1. 优先使用 `navigator.sendBeacon` 确保数据可靠发送
2. 回退到 `fetch` + `keepalive` 选项
3. 所有请求使用 HTTPS 加密传输

### 隐私保护
- 生成匿名用户ID，无法关联到真实身份
- 不收集用户浏览的URL或个人信息
- 只收集必要的统计数据

## 配置信息

### Umami 服务器配置
- **服务器地址**: `https://umami.lunarye.com`
- **Website ID**: `c0b57f97-5293-42d9-8ec2-4708e4ea68ae`

### 本地存储结构
```json
{
  "analytics_user_id": "user_1704067200_abc123",
  "analytics_install_recorded": true,
  "analytics_install_date": "2024-01-01T10:30:25.000Z"
}
```

## 测试方法

### 开发环境测试
1. 在 `shared/analytics.js` 中启用调试模式：
   ```javascript
   const analytics = new UmamiAnalytics({
     debug: true  // 启用调试日志
   });
   ```

2. 重新加载扩展或安装扩展
3. 打开浏览器开发者工具，查看控制台日志
4. 应该看到类似日志：
   ```
   Extension installed, tracking user install...
   Analytics initialized with user ID: user_1704067200_abc123
   Event tracked: user_install SUCCESS
   ```

### 验证数据发送
1. 检查网络面板，应该看到对 `https://umami.lunarye.com/api/send` 的请求
2. 登录 Umami 控制台查看是否收到 `user_install` 事件

### 测试去重功能
1. 多次重新加载扩展
2. 应该只在第一次看到 "tracking user install" 日志
3. 后续会看到 "User install already recorded, skipping" 日志

## 故障排除

### 常见问题

1. **没有看到分析请求**
   - 检查 manifest.json 中是否添加了 `https://umami.lunarye.com/*` 权限
   - 确认网络连接正常

2. **重复发送安装事件**
   - 检查 `chrome.storage.local` 中的 `analytics_install_recorded` 字段
   - 清除扩展数据重新测试

3. **请求被阻止**
   - 检查 CORS 设置
   - 确认 Umami 服务器可访问

### 调试命令
在扩展的控制台中执行：
```javascript
// 检查用户ID
chrome.storage.local.get(['analytics_user_id'], (result) => {
  console.log('User ID:', result.analytics_user_id);
});

// 检查安装记录状态  
chrome.storage.local.get(['analytics_install_recorded'], (result) => {
  console.log('Install recorded:', result.analytics_install_recorded);
});

// 清除分析数据（重新测试用）
chrome.storage.local.remove(['analytics_user_id', 'analytics_install_recorded']);
```

## 数据查看

### 在 Umami 中查看统计数据
1. 登录 Umami 控制台
2. 选择对应的网站项目
3. 在事件统计中查看 `user_install` 事件
4. 可以按时间、浏览器类型、平台等维度分析

### 关键指标
- **累计安装用户数**: `user_install` 事件的总数
- **每日新增用户**: 按日期分组的 `user_install` 事件数
- **浏览器分布**: 通过 `browser` 字段统计
- **平台分布**: 通过 `platform` 字段统计

## 下一步计划

### 即将添加的功能
- 日活跃用户统计（DAU）
- 功能使用统计
- 用户设置中的开关控制

### 扩展建议
- 添加用户配置界面允许关闭统计
- 实现更详细的功能使用分析
- 添加错误监控和性能统计

---

**注意**: 此功能完全遵循隐私保护原则，不收集任何可识别个人身份的信息。