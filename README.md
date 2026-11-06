# 知乎过滤器

在本地过滤知乎首页推荐：关键词、广告和有明确标记的盐选小说。命中后隐藏整张卡片，不留下占位或“临时展开”按钮。

运行时无第三方依赖、无模型调用，规则只保存在本机。过滤器相互独立，预留异步接口，方便以后接入 LLM。

[安装用户脚本](https://github.com/kdjs42/zhihu-safari-filter/releases/latest/download/zhihu-filter.user.js) · [下载 v0.4.0](https://github.com/kdjs42/zhihu-safari-filter/releases/tag/v0.4.0) · [过滤规则与适配边界](docs/FILTERING.md) · [开发与接入 LLM](docs/DEVELOPMENT.md) · [更新记录](CHANGELOG.md)

## 功能

- **关键词过滤**：每行一个关键词；任意命中即隐藏。默认只匹配标题，也可选择“标题＋摘要”。忽略大小写及全半角差异，按字面子串匹配，不使用正则。
- **广告过滤**：识别广告卡片和显式广告标记，包括部分侧栏 Banner。
- **盐选小说过滤**：识别小说／故事标记，以及盐选付费标记与虚构创作标记的组合；保留普通盐选知识内容。

仅支持电脑网页版的知乎首页推荐流。

## 安装

### 推荐：通过 Userscripts 使用

使用 App Store 安装的 [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) 承载过滤脚本，不需要为本项目注册付费 Apple 开发者账号，也不受 Safari 临时扩展的 24 小时限制。

1. 安装并打开 Userscripts，在 Safari → 设置 → 扩展中启用它，并允许访问 `www.zhihu.com`。
2. 下载 [zhihu-filter.user.js](https://github.com/kdjs42/zhihu-safari-filter/releases/latest/download/zhihu-filter.user.js)，放入 Userscripts 的脚本目录；目录可在 Userscripts 中查看或设置。也可用 Userscripts 编辑器的 **New Remote** 添加上面的链接。
3. 打开一次 Userscripts 工具栏面板，使新脚本被识别，然后刷新知乎首页。
4. 点击页面左下角的 **“过滤设置”**，填写关键词并保存。面板提供设置文本备份的导入、导出。

**从旧插件迁移：** 先复制旧扩展中的关键词和记录开关状态，再停用旧的“知乎过滤器”扩展，刷新页面后在用户脚本面板中粘贴词表。两种安装方式存储独立，不能自动读取旧词表；不要同时开启两版。

脚本更新可在 Userscripts 中检查，也可下载新版覆盖原脚本。保持脚本名称“知乎过滤器”及文件身份一致，更新前可导出设置备份。其他知乎标签页在切回前台后读取新设置。

脚本无需编译即可安装。安装方式依据 [Userscripts 官方说明](https://github.com/quoid/userscripts#usage)。

### 可选：原生 Safari 扩展开发版

仍提供 Safari Web Extension 源码和未签名 ZIP，供开发测试。下述临时安装方式有 24 小时时限；日常使用推荐上面的用户脚本版。

### 支持临时扩展的 Safari

本项目在 Safari 27.0 的本地合成页面上完成过过滤行为自检。临时安装入口以 Safari 实际界面为准：

1. 从 [Releases](https://github.com/kdjs42/zhihu-safari-filter/releases) 下载 `zhihu-filter-0.4.0.zip`；也可下载仓库源码，使用其中的 `extension/` 文件夹。
2. 打开 Safari → 设置 → 高级，启用网页开发者功能。
3. 在设置 → 开发者中选择 **Add Temporary Extension… / 添加临时扩展…**，按提示选择 ZIP 或 `extension/` 文件夹。
4. 在“扩展”设置中启用“知乎过滤器”，允许访问 `www.zhihu.com`。使用 Safari 描述文件时，要在当前描述文件中启用。
5. 刷新知乎首页，打开扩展面板，每行填入一个关键词，点击“保存并应用”。

临时扩展会在退出 Safari 或 24 小时后移除。请保留词表副本；跨重装是否保留设置取决于 Safari 的扩展身份处理。长期安装需要另行打包、签名。

如果 Safari 没有临时扩展入口，可用完整 Xcode 提供的 Safari Web Extension 打包工具封装；仅安装 Command Line Tools 不够。具体步骤见 Apple 的[运行扩展](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)和[打包扩展](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)文档。

### 更新原生扩展开发版

加载文件夹的用户：更新源码，在 Safari 中重新加载扩展，再刷新知乎。

加载 ZIP 的用户：先备份关键词，再替换为新版 ZIP 并刷新知乎。旧版设置读取时会自动补齐新选项，新过滤器和自动补充默认开启。

## 隐私与权限

- 用户脚本只匹配 `https://www.zhihu.com/*`，仅使用 `GM.getValue` / `GM.setValue` 保存设置，不使用知乎的 localStorage。原生开发版仅申请 `storage` 和知乎域名权限。
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

产物为 `dist/zhihu-filter.user.js`、更新元数据 `dist/zhihu-filter.meta.js` 和原生开发版 `dist/zhihu-filter-0.4.0.zip`。`dist/` 和 `node_modules/` 不进入源码仓库；发布包在 Releases 下载。GitHub Actions 会检查源码、运行测试并上传打包产物。

用 Safari 打开 `tests/browser-smoke.html` 可运行原生扩展的本地演示；先运行 `npm run build:userscript`，再打开 `tests/userscript-smoke.html` 可验证用户脚本的原生弹窗和设置操作。演示使用模拟存储，不访问知乎。

v0.4.0 新增用户脚本打包集成测试，覆盖保存与重新加载、标签页切换同步、备份校验、重复注入和返回页面恢复。实际 Userscripts 安装、授权和真实知乎运行仍需实测。

v0.3.0 包含 35 项自动测试。500 条合成卡片中追加 1 条的内容提取次数由旧版的 502 次降至 1 次；无关 UI 变化不再提取帖子。这是调用次数对比，不是 Safari 帧率或耗时测量。完整证据及局限见[验证记录](docs/DEVELOPMENT.md#v030-验证记录2026-11-02)。

## 反馈问题

请在 [Issues](https://github.com/kdjs42/zhihu-safari-filter/issues) 提供 Safari 版本、扩展版本、所在页面类型、预期与实际行为。误过滤时可附不含个人信息的最小示例；不要上传 Cookie、账号凭据或私人消息。

网站选择器集中在 `extension/content/zhihu-adapter.js`，过滤逻辑在 `extension/core/`，自动补充在 `extension/content/feed-refiller.js`。

实现独立编写；选择器形态参考 [EasyList China](https://github.com/easylist/easylistchina/blob/master/easylistchina.txt) 和 [知乎增强](https://github.com/XIU2/UserScript/blob/master/Zhihu-Enhanced.user.js)。
