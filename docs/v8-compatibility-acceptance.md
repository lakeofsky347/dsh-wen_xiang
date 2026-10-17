# 问象 0.8.0：DSH 新版适配验收

2026-10-17 在 macOS arm64 完成源码适配、双版本回归、隔离 Web 验收和官方 CLI 安装回读。当前上游为 [DSH 0.2.1-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.1)，已核对发布标签、提交 `1600d8a1e140dcde43a1a0941940a0480712c011` 和本机安装版本。没有使用 `dsh_clone` 中未发布的本地改动替代官方接口。

## 完成的变化

- 插件版本为 0.8.0；声明 `engines.dsh` 与 DSH peer 范围 `>=0.2.0-rc.2 <0.3.0-0`，Node 基线同步至 22.19+ 的 22.x 或 24+。
- 使用新版 `prepareCall` 的注册绑定配置回调选择模型预算与最高思考档位，兼容不透明自定义档位 ID。旧版保留能力读取和派发校验；未知真实最大输出时明确使用宿主默认预算。
- 客户端监听新版连接 generation，丢失、替换和卸载时中止待处理请求并撤销旧结果回填；旧宿主保留 reset 事件路径。先恢复背景状态，再读取五模块原有结果，不自动重放提交。
- 运行库缓存按版本、来源指纹、平台及架构隔离，保留旧运行库。检查实际包名、semver 范围和解析身份，拒绝混装；更新预览保留官方模板中的依赖和 bundle。
- 新增 `npm run verify:compat`，一次执行准备、类型检查、插件回归、构建与运行库检查。开发文档、环境文档、README 已同步。新版 CLI 安装格式为 `dsh plugin --profile desktop add <archive>`。

## 验证结果

| 验证 | 结果 | 本地证据 |
| --- | --- | --- |
| 官方 0.2.1-rc.1 运行库 | 247/247 回归通过，类型检查、构建、环境检查通过 | `artifacts/verification-compatibility/rc1-release/report.json` |
| 原有 0.2.0-rc.2 运行库 | 同一源码 247/247 回归通过，类型检查、构建、环境检查通过 | `artifacts/verification-compatibility/rc2-release/report.json` |
| rc.1 隔离 Web | 60/60 浏览器检查通过 | `artifacts/verification-v7/2026-10-17T06-54-56-165Z/report.json` |
| 官方 rc.1 CLI | 在专用 home 中离线安装 0.8.0 成功 | `artifacts/verification-compatibility/installation-final.json` |
| 已安装文件回读 | 40 个文件逐字节与最终包一致；78 张塔罗、36 张雷诺曼素材和五个公开规则入口完整 | `artifacts/verification-compatibility/installed-package-integrity.json` |
| 已安装包运行库检查 | 五个规则入口、历法、加密、实际 peer 身份和 Host 导入通过 | `artifacts/verification-compatibility/installed-environment.json` |

两版构建的 Host 与客户端哈希一致，浏览器实际加载的客户端字节与最终包相同。浏览器覆盖五模块本地结果、十牌阵、宽窄布局、150%/200% CSS zoom、长文流式输出、显式继续、追问与页面往返；外部网络和非模拟供应商请求均被阻止。新增连接丢失、取消、迟到响应与不重放变更的行为另由聚焦回归验证。

## 交付

- 安装包：`artifacts/dsh-meihua-0.8.0.tgz`
- SHA-256：`bb870d7e8b64202ab7fd8680d5d31b1c5dcc3ee15781937b347694cf4b494f0d`
- 校验文件：`artifacts/dsh-meihua-0.8.0.sha256`
- 汇总报告：`artifacts/verification-compatibility/acceptance.json`
- 后续更新步骤：[DSH 更新兼容性](dsh-compatibility.md)

## 验证边界

本次安装位于 `.local/v8-final-install-home` 的独立 profile，日常 Desktop 未安装这个候选包；本机 DSH 应用及参考仓库未修改。隔离 Web 使用本地合成供应商，没有真实模型调用。没有重做 Windows/Linux 新版原生验收，也没有执行 Git 提交、推送或发布。未来版本仍须运行兼容检查并核对发布接口，安装范围不能代替实际验收。
