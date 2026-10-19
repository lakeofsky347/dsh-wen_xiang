# DSH 更新兼容性

问象 0.8.1 以 DeepSeek Harness **0.2.1-rc.1** 为当前适配目标，保留 **0.2.0-rc.2** 的接口路径。核对日期为 2026-10-17；官方发布标签为 [`dsh-v0.2.1-rc.1`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.1)，对应提交 `1600d8a1e140dcde43a1a0941940a0480712c011`。

## 安装范围与实际验证

`package.json` 的 `engines.dsh` 以及 DSH peer 统一声明 `>=0.2.0-rc.2 <0.3.0-0`。新版插件管理器会优先读取 `engines.dsh`；旧版仍可依据 peer 判断。新版 CLI 的 profile 参数放在 `plugin` 与子命令之间，例如 `dsh plugin --profile desktop add /absolute/path/dsh-meihua-0.8.1.tgz`。版本检查与宿主一致，使用 semver 的 `includePrerelease: true`。Cordis 保持独立的 `^4.0.4` 范围。

这个范围让后续 0.2.x 补丁和候选版本有继续使用的空间，不表示尚未发布的接口已经验证。0.3 及后续版本需要审计后再扩大声明。Node 基线同步为 `^22.19.0 || >=24.0.0`。

最新验证结果、运行库指纹、每项日志和构建哈希在本地 `artifacts/verification-compatibility/`；浏览器结果另存于 `artifacts/verification-v7/`。只有报告明确通过的版本和运行路径才算实际验证。日常 Desktop 安装、真实模型内容质量、Windows/Linux 新版原生验收应分别确认。

## 运行时适配

**模型能力。** 新版 `llm.prepareCall(config, signal, configure)` 在固定供应商注册和模型元数据之后执行配置回调。问象从这个快照确定预算与思考档位，使用该版本已明确约定的由低到高的 `reasoning.efforts` 顺序，因此自定义档位 ID 也可选到最高档。最终输出使用同一个 prepared handle，阻止准备和派发之间切换到另一个注册。

旧宿主忽略第三个参数时，沿用既有的模型能力读取和 prepared 验证；可确认的标准档位或显式最高档继续工作，无法确认的自定义顺序显示未知。缺少能力元数据时沿用宿主默认，不猜测真实最大输出。官方 rc.1 提供的 `defaultMaxTokens` 是部署默认预算，界面不会把它显示为模型硬上限。已有扩展宿主提供真实上限时，仍可使用该字段。

**连接更新。** 新宿主提供连接 generation 时，在连接丢失、替换或插件卸载时中止本代待处理请求，清空私密页面缓存，再读取当前背景状态和冻结结果。旧宿主沿用 `connection/reset`。已经发出的变更不自动重试，迟到结果无法覆盖新连接状态。连接中断时提交是否生效需要以恢复后的服务状态为准。

**界面与数据。** 继续使用公开的 `main`、`sidebar.panellist`、主题事件、ModuleLoader 和受鉴权保护的 Connection 路由。五种本地算法、加密共享背景格式和旧版结果不做迁移；更新兼容性由插件内部处理，无需修改宿主源码。

## 更新运行库时的检查步骤

1. 安装或解压新的官方 DSH，保留当前工作目录和旧版运行库。参考源码需与发布标签一致，不能用参考仓库中未发布的本地修改代替发行接口。
2. 在本仓库运行 `npm run verify:compat`。默认读取本机安装；也可以用 `npm run verify:compat -- --runtime /absolute/path/to/released-runtime --output artifacts/verification-compatibility/new-release` 指定完整发行目录。
3. 检查报告是否为 `PASS`。命令依次执行准备、类型检查、全部插件回归、构建、五个公开规则导出、加密运算、DSH 版本范围与 peer 实际解析身份检查。单独运行 `npm test` 时，默认使用 `.local/runtime-selected.json` 指向的相同运行库。
4. 用独立的 `DSH_PREVIEW_HOME=.local/new-release-home npm run preview` 启动官方宿主，验证五模块、本地模拟解读、追问、手动继续、取消、连接恢复及主题布局。需要测试旧版时，同时指定对应官方 `DSH_CLI`，确保运行的宿主和选定库一致。
5. 用 `npm pack --pack-destination artifacts` 构建新包；对解压后的包运行 `scripts/verify-package.mjs`。安装包、构建目录和实际加载的客户端应具有一致哈希。

`prepare:local` 按版本、归档指纹和平台分配 `.local/runtimes/` 缓存，记录 `.local/runtime-selected.json`。旧的 `.local/runtime` 和旧缓存会保留。同一缓存的来源发生变化时明确失败；不会覆盖桌面应用。预览配置保留宿主生成的依赖与 bundle，只追加问象。

## 本次验收记录

本次具体通过项、包哈希和验证边界见同目录的 [0.8 适配验收记录](v8-compatibility-acceptance.md)。未来更新应生成新的报告，不覆盖旧报告作为新版本已通过的证据。
