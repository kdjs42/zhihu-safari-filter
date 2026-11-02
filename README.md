# 知乎过滤器

在本地过滤知乎首页推荐：关键词、广告和有明确标记的盐选小说。命中后隐藏整张卡片，不留下占位或“临时展开”按钮。

运行时无第三方依赖、无模型调用，规则只保存在本机。过滤器相互独立，预留异步接口，方便以后接入 LLM。

[下载 v0.3.1](https://github.com/kdjs42/zhihu-safari-filter/releases/tag/v0.3.1) · [过滤规则与适配边界](docs/FILTERING.md) · [开发与接入 LLM](docs/DEVELOPMENT.md) · [更新记录](CHANGELOG.md)

## 功能

- **关键词过滤**：每行一个关键词；任意命中即隐藏。默认只匹配标题，也可选择“标题＋摘要”。忽略大小写及全半角差异，按字面子串匹配，不使用正则。
- **广告过滤**：识别广告卡片和显式广告标记，包括部分侧栏 Banner。
- **盐选小说过滤**：识别小说／故事标记，以及盐选付费标记与虚构创作标记的组合；保留普通盐选知识内容。

仅支持电脑网页版的知乎首页推荐流。

## 安装

当前交付 **Safari Web Extension 源码和未签名 ZIP**，不是 App Store 应用。无需安装 Node.js 即可使用。

### 支持临时扩展的 Safari

本项目在 Safari 27.0 的本地合成页面上完成过过滤行为自检。临时安装入口以 Safari 实际界面为准：

1. 从 [Releases](https://github.com/kdjs42/zhihu-safari-filter/releases) 下载 `zhihu-filter-0.3.1.zip`；也可下载仓库源码，使用其中的 `extension/` 文件夹。
2. 打开 Safari → 设置 → 高级，启用网页开发者功能。
3. 在设置 → 开发者中选择 **Add Temporary Extension… / 添加临时扩展…**，按提示选择 ZIP 或 `extension/` 文件夹。
4. 在“扩展”设置中启用“知乎过滤器”，允许访问 `www.zhihu.com`。使用 Safari 描述文件时，要在当前描述文件中启用。
5. 刷新知乎首页，打开扩展面板，每行填入一个关键词，点击“保存并应用”。

临时扩展会在退出 Safari 或 24 小时后移除。请保留词表副本；跨重装是否保留设置取决于 Safari 的扩展身份处理。长期安装需要另行打包、签名。

如果 Safari 没有临时扩展入口，可用完整 Xcode 提供的 Safari Web Extension 打包工具封装；仅安装 Command Line Tools 不够。具体步骤见 Apple 的[运行扩展](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)和[打包扩展](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)文档。

### 更新

加载文件夹的用户：更新源码，在 Safari 中重新加载扩展，再刷新知乎。

加载 ZIP 的用户：先备份关键词，再替换为新版 ZIP 并刷新知乎。旧版设置读取时会自动补齐新选项，新过滤器和自动补充默认开启。

## 隐私与权限

- 只申请 `storage` 和 `https://www.zhihu.com/*`，关键词保存在扩展本地存储。
- 扩展不收集或上传浏览内容，不读取 Cookie，不调用外部模型或分析服务。
- 自动补充会触发知乎自身的加载行为，可能增加流量和页面内存；这不等于网络广告拦截，也不保证阻止知乎的曝光上报。
- 卡片通过 CSS 隐藏，原始 DOM 保留，以支持恢复及页面框架的正常运行。

## 开发

使用 Node.js 24.15+ 的 24.x（也支持 22.22.2+ 的 22.x、26+）：

```sh
npm ci
npm run check
npm test
npm run package
```

产物为 `dist/zhihu-filter-0.3.1.zip`。`dist/` 和 `node_modules/` 不进入源码仓库；发布包在 Releases 下载。GitHub Actions 会检查源码、运行测试并上传打包产物。

用 Safari 打开 `tests/browser-smoke.html` 可运行本地演示；卡片和存储都是模拟数据，不访问知乎。

v0.3.0 包含 35 项自动测试。500 条合成卡片中追加 1 条的内容提取次数由旧版的 502 次降至 1 次；无关 UI 变化不再提取帖子。这是调用次数对比，不是 Safari 帧率或耗时测量。完整证据及局限见[验证记录](docs/DEVELOPMENT.md#v030-验证记录2026-11-02)。

## 反馈问题

请在 [Issues](https://github.com/kdjs42/zhihu-safari-filter/issues) 提供 Safari 版本、扩展版本、所在页面类型、预期与实际行为。误过滤时可附不含个人信息的最小示例；不要上传 Cookie、账号凭据或私人消息。

网站选择器集中在 `extension/content/zhihu-adapter.js`，过滤逻辑在 `extension/core/`，自动补充在 `extension/content/feed-refiller.js`。

实现独立编写；选择器形态参考 [EasyList China](https://github.com/easylist/easylistchina/blob/master/easylistchina.txt) 和 [知乎增强](https://github.com/XIU2/UserScript/blob/master/Zhihu-Enhanced.user.js)。
