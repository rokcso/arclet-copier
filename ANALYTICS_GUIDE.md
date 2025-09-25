# Arclet Copier 分析功能使用指南

## 功能概述

已为 Arclet Copier 扩展集成了基础的用户统计分析功能，支持安装和更新事件追踪。

## 当前功能

### 扩展安装/更新统计
- 自动记录扩展的新安装和更新事件
- 首次安装事件仅记录一次，避免重复统计
- 更新事件记录版本变更信息
- 数据发送到指定的 Umami 分析服务器

## 架构设计

### 模块结构
- `shared/analytics.js` - 主入口，统一导出分析功能
- `shared/umami-core.js` - Umami API 核心引擎，处理数据发送
- `shared/analytics-events.js` - 具体业务事件定义和逻辑
- `background/background.js` - 在扩展安装/更新时触发分析事件

### 数据流程
1. 扩展安装/更新 → `chrome.runtime.onInstalled` 监听器
2. 调用 `trackInstall()` → 检查是否已记录（仅首次安装）
3. 调用 `sendEvent()` → 添加公共属性并构建 Umami 格式
4. 发送到 Umami API → 使用 sendBeacon/fetch 双重保障

## 技术实现

### 事件类型
- **事件名称**: `install`
- **触发时机**: 扩展首次安装或更新时
- **实际发送的数据结构**:
  ```json
  {
    "type": "event",
    "payload": {
      "website": "c0b57f97-5293-42d9-8ec2-4708e4ea68ae",
      "name": "install",
      "language": "zh-CN",
      "data": {
        "$user_id": "user_abc123def456",
        "$timestamp": 1704067225000,
        "$time": "10:30:25",
        "$date": "2024-01-01",
        "$platform": "mac",
        "$browser": "chrome", 
        "$version": "1.6.0",
        "install_type": "install",
        "install_date": "2024-01-01",
        "previous_version": "1.5.0"
      }
    }
  }
  ```

### 数据发送机制
1. **优先策略**: 使用 `navigator.sendBeacon` 确保数据可靠发送（特别是在页面卸载时）
2. **回退策略**: 当 sendBeacon 失败时，回退到 `fetch` + `keepalive` 选项
3. **安全保障**: 所有请求使用 HTTPS 加密传输，设置 CORS 模式

### 用户ID管理
- **生成规则**: `user_${random6}${time6}` 格式，基于性能时间戳和随机数
- **存储方式**: 存储在 `chrome.storage.local` 的 `analytics_user_id` 字段
- **持久化**: 一次生成，长期使用，确保用户统计的准确性

### 防重复机制
- **首次安装**: 使用 `analytics_install_recorded` 标记，确保只记录一次
- **版本追踪**: 存储 `analytics_last_version` 用于更新事件的版本对比
- **时间戳记录**: 存储 `analytics_install_date` 记录首次安装时间

### 环境检测
- **浏览器识别**: 通过 User-Agent 检测 Chrome/Edge/Firefox
- **平台识别**: 检测 Mac/Windows/Linux 操作系统
- **语言获取**: 使用 `chrome.i18n.getUILanguage()` 获取界面语言

### 隐私保护
- 生成匿名用户ID，无法关联到真实身份
- 不收集用户浏览的URL或个人信息  
- 只收集扩展使用统计和技术环境信息

## 配置信息

### Umami 服务器配置
- **服务器地址**: `https://umami.lunarye.com`
- **Website ID**: `c0b57f97-5293-42d9-8ec2-4708e4ea68ae`

### 本地存储结构
```json
{
  "analytics_user_id": "user_abc123def456",
  "analytics_install_recorded": true,
  "analytics_install_date": "2024-01-01T10:30:25.000Z",
  "analytics_last_version": "1.6.0"
}
```

## 测试方法

### 开发环境测试
1. 重新加载扩展或全新安装扩展
2. 打开扩展的 Service Worker 控制台（chrome://extensions/ > 开发者模式 > Service Worker）
3. 查看控制台日志，应该看到：
   ```
   Extension install, tracking installation event...
   Generated new user ID: user_abc123def456
   Event "install" sent successfully via sendBeacon
   Extension install tracked successfully
   Install marked as recorded
   ```

### 验证数据发送
1. 检查 Service Worker 的网络面板，应该看到对 `https://umami.lunarye.com/api/send` 的请求
2. 请求体应该包含完整的 Umami 标准格式数据
3. 登录 Umami 控制台查看是否收到 `install` 事件

### 测试去重功能
1. 多次重新加载扩展
2. 应该只在第一次看到完整的安装追踪日志
3. 后续重载会看到 "User install already recorded, skipping" 日志

### 测试更新事件
1. 修改 manifest.json 中的版本号
2. 重新加载扩展，应该触发 update 事件
3. 日志中会显示 "Extension update, tracking installation event..."
4. 数据中会包含 `previous_version` 字段

## 故障排除

### 常见问题

1. **没有看到分析请求**
   - 检查 manifest.json 中是否添加了 `https://umami.lunarye.com/*` 权限
   - 确认网络连接正常
   - 检查 Service Worker 是否正常启动

2. **重复发送安装事件**
   - 检查 `chrome.storage.local` 中的 `analytics_install_recorded` 字段
   - 注意更新事件不受防重复限制，每次更新都会发送

3. **请求被阻止或失败**
   - 检查网络连接和防火墙设置
   - 确认 Umami 服务器可访问
   - 查看 sendBeacon 是否成功，失败时检查 fetch 回退

4. **用户ID生成失败**
   - 检查 chrome.storage.local 访问权限
   - 查看是否有存储配额限制

### 调试命令
在 Service Worker 控制台中执行：
```javascript
// 检查所有分析相关数据
chrome.storage.local.get([
  'analytics_user_id', 
  'analytics_install_recorded', 
  'analytics_install_date',
  'analytics_last_version'
], console.log);

// 清除分析数据（重新测试用）
chrome.storage.local.remove([
  'analytics_user_id', 
  'analytics_install_recorded', 
  'analytics_install_date',
  'analytics_last_version'
]);

// 手动触发安装事件（测试用）
import { trackInstall } from './shared/analytics.js';
trackInstall('install');
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