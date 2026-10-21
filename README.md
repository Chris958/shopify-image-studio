# Shopify Image Studio

用于 Shopify 网站氛围图制作的多品牌工作台：沉淀品牌规范，按模块生成电脑与手机端预览，并使用真实品牌字体叠加活动文案，确认后导出精确尺寸图片。

## 功能

- 独立品牌项目：素材、设计规范版本、任务和历史记录。
- 上传 Logo、参考图、产品图、字体及品牌资料；人工整理或调用多模态模型提炼规范。
- 首页 Banner、页面 Header、活动模块等尺寸模板，以及项目自定义尺寸。
- 模型档案和任务路由：Responses、Chat Completions、Images 兼容接口，可填写自己的模型 ID。
- API Key 在浏览器中用口令加密保存；服务器仅在当次调用中使用。
- 低清预览、修改历史、双端分别确认、高清增强、PNG/JPG/WebP 和 ZIP 导出。
- 主标题、副标题、短描述、CTA 独立图层，品牌字体锁定、自动换行和位置微调。

## 本地开发

需要 Node.js >= 22.13 和 pnpm 11。使用锁文件安装依赖：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

示例项目可体验预览、排版和导出，不会调用图片 API。真实模型调用需要你自行配置模型服务、模型权限和 API Key；仓库不包含凭证。

```sh
pnpm typecheck
pnpm test
pnpm build
```

应用基于 React 19、Vinext/Vite，服务端运行在 Cloudflare Workers。托管清单位于 `.openai/hosting.json`，`DB` 为 D1、`BUCKET` 为 R2。首次访问时应用创建所需数据表。正式项目接口需要 ChatGPT 身份认证，托管部署需配置相应身份服务及存储绑定；本地示例体验不代表正式环境认证已配置。

## 代码结构

- `app/studio.tsx`：品牌项目、规范、工作台、历史与模型配置。
- `app/components/studio-dialog.tsx`：弹窗、焦点约束、背景滚动锁定。
- `app/api/`：项目和文件隔离、模型调用及任务记录。
- `lib/atmos-render.ts`：精确尺寸画布、真实字体、文字布局和 ZIP。
- `lib/atmos-vault.ts`：浏览器本机凭证加密。
- `tests/core.mjs`：认证、数据隔离、不可变规范、凭证排除、URL 校验及导出测试。

部分内部文件名和浏览器存储键保留 `atmos` 前缀，以兼容已有配置和项目备份。新导出的备份使用 `shopify-image-studio-project-v1`，同时支持导入旧格式。

## 布局回归检查

将 `tests/layout-review.html` 临时复制到 `public/__layout-review.html`，启动预览后访问 `/__layout-review.html`。检查完删除公开目录中的副本，避免发布测试入口。

检查宽度 320、390、550、600、768、900、1100、1280，弹窗额外检查高度 480。覆盖概览、素材、品牌规范、生成、文案排版、历史、模型配置；点击“检查当前布局”核对横向溢出和弹窗边界。弹窗中使用 Tab/Shift+Tab 应保持焦点，Escape 应关闭并恢复入口焦点。

## 数据与部署

代码仓库仅包含源代码和示例图片，不包含用户项目、上传素材、数据库、浏览器凭证或本机状态。项目备份用于迁移业务数据，代码仓库用于版本管理。连接测试仅验证对应接口响应，真实多模态和生图能力需要实际任务验证。
