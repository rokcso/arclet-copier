# URL 参数自定义配置功能实现计划

## 功能概述

允许用户自定义 URL 参数清理规则，包括跟踪参数和功能参数两个独立列表。用户可以查看预置参数、添加新参数、删除参数、恢复默认配置。

## 核心逻辑

- **Off 模式**：不清理任何参数
- **Smart 模式**：清除跟踪参数列表中的参数，保留功能参数列表中的参数
- **Aggressive 模式**：清除所有参数（不受列表影响）

---

## 实现任务清单

### 阶段 1：数据层实现

#### 1.1 定义数据结构
- [ ] 在 `shared/constants.js` 中定义存储结构常量
  ```javascript
  export const CUSTOM_PARAM_RULES_KEY = 'customParamRules';
  export const DEFAULT_PARAM_RULES = {
    tracking: [...PARAM_CATEGORIES.TRACKING],
    functional: [...PARAM_CATEGORIES.FUNCTIONAL],
    version: "1.0"
  };
  ```

#### 1.2 实现初始化逻辑
- [ ] 在 `shared/constants.js` 中添加 `initializeParamRules()` 函数
  - 检查是否已存在 `customParamRules`
  - 如果不存在，使用 `PARAM_CATEGORIES` 初始化
  - 设置 version 和 lastModified 字段

#### 1.3 实现参数加载函数
- [ ] 在 `shared/constants.js` 中添加 `getCustomParamRules()` 函数
  - 从 Chrome Storage Sync 读取
  - 如果不存在，返回默认配置
  - 返回 `{ tracking: [], functional: [] }`

#### 1.4 实现参数保存函数
- [ ] 在 `shared/constants.js` 中添加 `saveCustomParamRules(rules)` 函数
  - 更新 lastModified 时间戳
  - 保存到 Chrome Storage Sync
  - 返回保存成功/失败状态

#### 1.5 修改参数匹配逻辑
- [ ] 修改 `shouldKeepParameter(paramName, cleaningMode)` 函数
  - 添加异步支持（改为 async 函数）
  - 从 `getCustomParamRules()` 读取用户配置
  - Smart 模式下使用用户配置的列表进行匹配
  - 保持向后兼容（无配置时使用默认）

#### 1.6 更新 processUrl 函数
- [ ] 修改 `processUrl(url, cleaningMode)` 函数为异步
  - 将内部调用 `shouldKeepParameter` 改为 await
  - 确保所有调用 `processUrl` 的地方都使用 await

---

### 阶段 2：UI 界面实现

#### 2.1 HTML 结构
- [ ] 在 `options/options.html` 中添加新的设置区块
  - 在 "常规设置" 或 "外观设置" 之后添加
  - 标题：`<h2 data-i18n="urlParamConfig">URL 参数配置</h2>`
  - 跟踪参数区域
    - 标题和说明
    - 参数标签容器 `<div id="trackingParamsList" class="param-tags-container"></div>`
    - 添加按钮 `<button id="addTrackingParamBtn" class="param-add-btn">`
  - 功能参数区域
    - 标题和说明
    - 参数标签容器 `<div id="functionalParamsList" class="param-tags-container"></div>`
    - 添加按钮 `<button id="addFunctionalParamBtn" class="param-add-btn">`
  - 恢复默认按钮 `<button id="resetParamRulesBtn" class="reset-btn">`

#### 2.2 CSS 样式
- [ ] 在 `options/options.css` 中添加样式
  - `.param-tags-container` - 参数标签容器（流式布局）
  - `.param-tag` - 单个参数标签样式
    - 圆角背景
    - 带删除按钮
    - hover 效果
  - `.param-name` - 参数名称样式
  - `.param-remove` - 删除按钮样式（× 图标）
  - `.param-add-btn` - 添加参数按钮样式
  - `.reset-btn` - 恢复默认按钮样式
  - 添加响应式布局支持

#### 2.3 添加参数模态框
- [ ] 在 `options/options.html` 中添加简单的输入模态框
  ```html
  <div class="param-input-modal" id="paramInputModal">
    <div class="param-input-content">
      <h3 data-i18n="addParamTitle">添加参数</h3>
      <input type="text" id="paramNameInput" placeholder="参数名称">
      <div class="modal-actions">
        <button id="cancelParamBtn">取消</button>
        <button id="confirmParamBtn">添加</button>
      </div>
    </div>
  </div>
  ```
- [ ] 添加对应的 CSS 样式
  - 居中显示
  - 半透明背景遮罩
  - 输入框样式

---

### 阶段 3：交互逻辑实现

#### 3.1 初始化和加载
- [ ] 在 `options/options.js` 中添加参数配置初始化逻辑
  - 页面加载时调用 `loadParamRules()`
  - 从 Storage 加载数据
  - 渲染两个参数列表

#### 3.2 渲染参数列表
- [ ] 实现 `renderParamTags(containerId, params, category)` 函数
  - 清空容器
  - 遍历参数数组，创建参数标签
  - 每个标签包含参数名和删除按钮
  - 为删除按钮绑定事件监听器
  - 参数按字母顺序排序显示

#### 3.3 添加参数功能
- [ ] 实现添加按钮点击事件
  - 显示输入模态框
  - 记录当前操作的类别（tracking/functional）
- [ ] 实现输入验证
  - 参数名不能为空
  - 参数名只能包含字母、数字、下划线
  - 不能重复添加已存在的参数
- [ ] 实现 `addParam(category, paramName)` 函数
  - 读取当前配置
  - 添加新参数到对应列表
  - 保存到 Storage
  - 重新渲染列表
  - 显示成功提示

#### 3.4 删除参数功能
- [ ] 实现删除按钮点击事件
  - 获取参数名和类别
  - 调用 `removeParam(category, paramName)`
- [ ] 实现 `removeParam(category, paramName)` 函数
  - 读取当前配置
  - 从对应列表中移除参数
  - 保存到 Storage
  - 重新渲染列表
  - 显示成功提示

#### 3.5 恢复默认功能
- [ ] 实现恢复默认按钮点击事件
  - 显示确认对话框
  - 用户确认后调用 `resetToDefaults()`
- [ ] 实现 `resetToDefaults()` 函数
  - 从 `PARAM_CATEGORIES` 重新初始化配置
  - 保存到 Storage
  - 重新渲染列表
  - 显示成功提示

#### 3.6 Toast 提示
- [ ] 添加操作反馈提示
  - 参数添加成功
  - 参数删除成功
  - 恢复默认成功
  - 参数验证失败提示

---

### 阶段 4：国际化支持

#### 4.1 添加中文文案
- [ ] 在 `_locales/zh_CN/messages.json` 中添加
  - `urlParamConfig`: "URL 参数配置"
  - `trackingParams`: "跟踪参数"
  - `trackingParamsDesc`: "智能清理模式下，这些参数会被移除"
  - `functionalParams`: "功能参数"
  - `functionalParamsDesc`: "智能清理模式下，这些参数会被保留"
  - `addParam`: "添加参数"
  - `addParamTitle`: "添加参数"
  - `paramNamePlaceholder`: "请输入参数名称（如：utm_source）"
  - `resetParamRules`: "恢复默认配置"
  - `resetParamRulesConfirm`: "确定要恢复默认配置吗？这将清除所有自定义参数规则。"
  - `paramAdded`: "参数已添加"
  - `paramRemoved`: "参数已删除"
  - `paramRulesReset`: "已恢复默认配置"
  - `paramNameInvalid`: "参数名称无效，只能包含字母、数字、下划线"
  - `paramExists`: "参数已存在"

#### 4.2 添加繁体中文文案
- [ ] 在 `_locales/zh_TW/messages.json` 中添加对应翻译

#### 4.3 添加英文文案
- [ ] 在 `_locales/en/messages.json` 中添加对应翻译

#### 4.4 添加其他语言文案
- [ ] 在其他语言文件夹中添加对应翻译（es, ja, de, fr, pt, ru, ko）

---

### 阶段 5：兼容性处理

#### 5.1 首次加载迁移
- [ ] 在 `background.js` 或首次加载时调用初始化
  - 检查是否存在旧的 `urlCleaning` 设置
  - 检查是否存在 `customParamRules`
  - 如果不存在，自动初始化

#### 5.2 向后兼容
- [ ] 确保 `processUrl` 函数在无自定义配置时使用默认行为
- [ ] 确保所有调用链路支持异步操作
  - `background.js` 中的复制逻辑
  - `popup.js` 中的复制逻辑
  - `batch/batch.js` 中的批量操作

#### 5.3 Storage 同步
- [ ] 测试 Chrome Storage Sync 的容量限制
  - 单个 key 最大 8KB
  - 预估参数列表大小
  - 添加容量检查（如果需要）

---

### 阶段 6：测试和验证

#### 6.1 功能测试
- [ ] 测试添加跟踪参数
  - 添加新参数
  - 复制包含该参数的 URL
  - 验证 Smart 模式下参数被清除
- [ ] 测试添加功能参数
  - 添加新参数
  - 复制包含该参数的 URL
  - 验证 Smart 模式下参数被保留
- [ ] 测试删除预置参数
  - 删除一个预置跟踪参数
  - 验证 Smart 模式下该参数不再被清除
- [ ] 测试恢复默认
  - 修改参数列表
  - 点击恢复默认
  - 验证列表恢复到初始状态

#### 6.2 边界情况测试
- [ ] 测试空参数名输入
- [ ] 测试重复参数添加
- [ ] 测试特殊字符参数名
- [ ] 测试大小写敏感性
- [ ] 测试长参数列表（性能）
- [ ] 测试 Storage 容量限制

#### 6.3 UI/UX 测试
- [ ] 测试响应式布局（不同窗口大小）
- [ ] 测试深色/浅色主题下的显示效果
- [ ] 测试不同语言下的显示
- [ ] 测试 Toast 提示显示
- [ ] 测试键盘操作（Enter 添加参数，ESC 关闭弹窗）

#### 6.4 兼容性测试
- [ ] 测试从旧版本升级（无 customParamRules）
- [ ] 测试与现有功能的兼容性
  - 静默复制
  - 快捷键复制
  - 批量复制
  - 短链生成
- [ ] 测试跨设备同步（Chrome Sync）

---

### 阶段 7：文档和优化

#### 7.1 代码注释
- [ ] 为新增函数添加 JSDoc 注释
- [ ] 为数据结构添加类型说明
- [ ] 为关键逻辑添加解释注释

#### 7.2 用户文档
- [ ] 更新 README.md（如有需要）
- [ ] 在 Options 页面添加使用说明链接
- [ ] 考虑添加首次使用引导（可选）

#### 7.3 性能优化
- [ ] 添加参数匹配缓存（如果列表很长）
- [ ] 优化渲染性能（虚拟滚动，如果参数超过 100 个）
- [ ] 减少 Storage 读写频率

#### 7.4 代码审查
- [ ] 检查代码风格一致性
- [ ] 检查错误处理完整性
- [ ] 检查安全性问题
- [ ] 检查无障碍访问支持

---

## 数据结构定义

### Chrome Storage 结构
```javascript
{
  "customParamRules": {
    "tracking": [
      "utm_source",
      "utm_medium",
      "fbclid",
      "gclid",
      // ... 更多参数
    ],
    "functional": [
      "page",
      "sort",
      "search",
      "filter",
      "id",
      // ... 更多参数
    ],
    "version": "1.0",
    "lastModified": "2024-05-01T10:30:00.000Z"
  }
}
```

---

## 关键函数签名

### shared/constants.js
```javascript
// 初始化参数规则
export async function initializeParamRules(): Promise<void>

// 获取自定义参数规则
export async function getCustomParamRules(): Promise<{
  tracking: string[],
  functional: string[]
}>

// 保存自定义参数规则
export async function saveCustomParamRules(rules: {
  tracking: string[],
  functional: string[]
}): Promise<boolean>

// 修改后的参数判断函数（异步）
export async function shouldKeepParameter(
  paramName: string,
  cleaningMode: 'off' | 'smart' | 'aggressive'
): Promise<boolean>
```

### options/options.js
```javascript
// 加载参数规则
async function loadParamRules(): Promise<void>

// 渲染参数标签
function renderParamTags(
  containerId: string,
  params: string[],
  category: 'tracking' | 'functional'
): void

// 添加参数
async function addParam(
  category: 'tracking' | 'functional',
  paramName: string
): Promise<boolean>

// 删除参数
async function removeParam(
  category: 'tracking' | 'functional',
  paramName: string
): Promise<boolean>

// 恢复默认配置
async function resetToDefaults(): Promise<boolean>

// 显示添加参数弹窗
function showAddParamModal(category: 'tracking' | 'functional'): void

// 验证参数名
function validateParamName(paramName: string): {
  valid: boolean,
  error?: string
}
```

---

## UI 布局示意

```
┌─────────────────────────────────────────────────────────┐
│  URL 参数配置                                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  🔴 跟踪参数 (Tracking Parameters)                      │
│  智能清理模式下，这些参数会被移除                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │                                                     │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │ │
│  │  │ utm_source × │ │ utm_medium × │ │ fbclid  ×  │ │ │
│  │  └──────────────┘ └──────────────┘ └────────────┘ │ │
│  │                                                     │ │
│  │  ┌──────────────┐ ┌──────────────┐                │ │
│  │  │ gclid      × │ │ igshid     × │    [+ 添加]    │ │
│  │  └──────────────┘ └──────────────┘                │ │
│  │                                                     │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  🟢 功能参数 (Functional Parameters)                    │
│  智能清理模式下，这些参数会被保留                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │                                                     │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │ │
│  │  │ page       × │ │ sort       × │ │ search  ×  │ │ │
│  │  └──────────────┘ └──────────────┘ └────────────┘ │ │
│  │                                                     │ │
│  │  ┌──────────────┐ ┌──────────────┐                │ │
│  │  │ filter     × │ │ id         × │    [+ 添加]    │ │
│  │  └──────────────┘ └──────────────┘                │ │
│  │                                                     │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  [恢复默认配置]                                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 实施注意事项

1. **异步处理**：`shouldKeepParameter` 改为异步后，所有调用链路都需要支持 async/await
2. **性能考虑**：参数匹配是高频操作，考虑添加缓存机制
3. **用户体验**：添加/删除参数时提供即时反馈
4. **数据安全**：恢复默认前需要确认，防止误操作
5. **国际化**：所有文案都要通过 i18n 系统
6. **样式一致**：与现有的模板管理器保持视觉风格一致

---

## 预估工作量

- 阶段 1（数据层）：2-3 小时
- 阶段 2（UI 界面）：2-3 小时
- 阶段 3（交互逻辑）：3-4 小时
- 阶段 4（国际化）：1-2 小时
- 阶段 5（兼容性）：1-2 小时
- 阶段 6（测试）：2-3 小时
- 阶段 7（优化文档）：1-2 小时

**总计：约 12-19 小时**

---

## 完成标准

- [ ] 所有功能按照设计正常工作
- [ ] 所有测试用例通过
- [ ] 支持所有 9 种语言的国际化
- [ ] UI 与现有风格一致
- [ ] 代码通过审查
- [ ] 文档更新完成
- [ ] 性能测试达标
- [ ] 无已知 Bug
