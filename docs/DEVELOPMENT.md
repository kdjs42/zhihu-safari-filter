# 开发与扩展

## 模块边界与接入 LLM

```text
extension/
  manifest.json
  core/
    settings.js           规则规范化
    keyword-filter.js     纯文本关键词判断
    ad-filter.js          广告结构信号判断
    yanxuan-filter.js     盐选与小说信号组合判断
    filter-engine.js      异步过滤链、短路、取消、超时和失败回退
  platform/
    settings-store.js     扩展本地存储和规则变更通知
  content/
    zhihu-adapter.js      知乎卡片选择器和纯数据提取
    renderer.js           可恢复的整卡隐藏，无占位元素
    feed-refiller.js      有限自动补充、暂停、超时与手动重试
    controller.js         动态增量处理、路由切换、过期结果丢弃
    main.js               扩展入口
  popup/                  设置面板
```

源码采用按 manifest 顺序加载的普通 JavaScript 文件，通过 content script 隔离环境内的 `ZhihuFilter` 命名空间连接，不向知乎页面注入脚本，不依赖打包器。逻辑模块不依赖浏览器存储或页面元素。

过滤器约定：

```js
const semanticFilter = {
  id: "semantic",
  async evaluate(post, settings, signal) {
    // post: { id, url, title, summary, author, signals }，不含 DOM。
    // 将请求委托给未来的扩展后台或本地服务，并遵守 signal。
    return { action: "abstain", reason: "未判断" };
  }
};

const engine = new ZhihuFilter.FilterEngine([
  new ZhihuFilter.AdFilter(),
  new ZhihuFilter.YanxuanFictionFilter(),
  new ZhihuFilter.KeywordFilter(),
  semanticFilter
]);
```

- `block`：明确过滤；`allow`：明确保留；两者都会短路后续过滤器。
- `abstain`：交给下一过滤器。关键词未命中返回 `abstain`，全部未决定则显示。
- 过滤器可返回 `reason`、`keyword`、`field` 等用于解释的字段；这些字段保存在内存中的判断结果里，不在页面插入提示块。
- 本地过滤器可同步返回；异步过滤器默认超时为 2 秒，可通过构造参数 `timeoutMs` 调整；异常、超时、无效结果均视为未决定。
- 更改设置、页面路由变化、卡片复用时中止旧请求；结果返回时再次核对内容，避免把旧判断套到新帖子上。
- 隐藏使用专用 DOM 属性与 CSS，不删除原内容。总开关关闭时恢复所有被本扩展隐藏的卡片。

接入实际 LLM 时仍需添加后台请求、凭据管理、并发/预算限制、缓存和必要的 API 域名权限。当前只实现模块边界与异步生命周期，不包含任何模型服务。缓存应包含帖子文本摘要、规则版本、模型版本和提示词版本；网页文本只作为待分类数据。

## 开发检查

开发建议使用 Node.js 24.15 或更新的 24.x（也支持 22.22.2+ 的 22.x、26+）；开发依赖 `jsdom` 只用于测试，不会打进扩展。

```sh
npm ci
npm run check
npm test
npm run package
```

输出：`dist/zhihu-filter-0.4.0.zip`。ZIP 根目录直接包含 `manifest.json`。

自动测试覆盖关键词规范化、异步过滤链、超时/取消、存储通知、动态加载、摘要/标题变化、规则删除与关闭、页面路由、无占位隐藏、广告标记、小说与非小说区分、独立开关、节点复用、过期结果、HTML 字面值安全展示及设置面板保存。

## v0.3.0 验证记录（2026-11-02）

- Node.js 24.22.1：35 项自动测试通过，包括自动补充的串行执行、5 次上限、无进展超时、后台/关闭/路由限制、重试、滚动通知和控制器集成。
- 500 条合成卡片的回归测试：追加 1 条的内容提取次数由旧版的 502 次降至 1 次；无关 body 子节点追加为 0 次；连续查询 100 次状态为 0 次卡片扫描。这是调用次数对比，不是 Safari 耗时或帧率测量。
- 所有扩展 JavaScript 语法、manifest 资源路径与最小权限检查通过。
- Safari 27.0：本地合成页面自检通过，验证整卡隐藏无占位、广告及盐选小说过滤、保留非小说盐选内容和关闭规则后恢复。
- 新版尚未在真实知乎页面完成自动补充验证；本地 Safari 自检验证过滤与设置界面，自动补充验证采用合成 DOM 和原生加载模拟，不代表真实推荐流触发成功。

## 用户脚本版本

`npm run build:userscript` 将 manifest 声明的核心与页面处理模块原样合并，排除原生扩展存储和入口，再加入 `userscript/settings-store.js`、`userscript/main.js`。设置界面的静态模板与基础样式复用扩展面板；`userscript/panel.css` 处理页面弹窗布局。生成的 `.user.js` 和 `.meta.js` 发布到 Releases，不入源码仓库。

用户脚本使用私有命名空间、`@inject-into content`、`@noframes`，只请求 `GM.getValue` / `GM.setValue`。面板放在 Shadow DOM 中；设置文字只写入表单值和 textContent。Userscripts 没有在本项目使用的 API 中提供跨标签页存储通知，因此在页面聚焦或切回前台时重新读取设置，不宣称后台标签页即时同步。

用户脚本的命名空间和脚本名称应保持稳定，以免影响脚本管理器对更新与存储的识别。新版 `.meta.js` 的版本取自 extension manifest，下载地址指向 Releases 最新版。两种分发方式均使用同一套过滤规则测试；用户脚本另有完整生成文件的集成测试。

v0.4.0 的 41 项自动测试及打包检查通过。另提供使用模拟 GM 存储的本地 Safari UI 自检页，但本次尚未完成该浏览器自检，也未验证真实 Userscripts 安装和知乎注入。
