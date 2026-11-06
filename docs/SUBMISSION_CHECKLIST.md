# Qoder 赛题提交清单

> 最后更新：2026-10-27  
> 用法：提交前逐项打勾；任何一项没做，在备注里写“未完成/未收集”，不要写“已通过”。

## 一、硬性验收

- [x] Qoder Sites 网站已发布，可见范围为「任何人都可访问」：<https://gapcoach-2pf0jobp824.qoder.zone>。
- [x] 无登录访问已验证：公开 URL、验证 JSON、源码包均返回 HTTP 200；并用未登录的独立浏览器会话打开，无登录墙。
- [x] 干净房间复现：独立目录 + 全新 venv + 空数据，按 README 安装并与 PowerContext 一起启动，完成诊断 → 计划 → 答题 → 反馈。
- [x] `scripts/verify.py` 复现“答错 → 记忆写入 → 下次计划包含薄弱点”，20/20 PASS（两次独立运行）。
- [x] Qoder 开发记录覆盖需求拆解、编码、调试、验证；Qoder 账号 UID 已填：`019e959e-97cb-717a-8eb0-66cab9d8499b`；5 张真实对话截图已补。
- [x] seekdb（混合检索、attempts/progress 落盘）与 PowerContext（Scope 恢复、weakness 记忆）均在核心功能中实际使用，可按验证 JSON 核对。

## 二、提交材料

| 材料 | 要求 | 产出位置 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| 项目网站网址 | Qoder Sites 发布后的完整 URL | <https://gapcoach-2pf0jobp824.qoder.zone> | 已发布并公开 | 个人账号发布；无需登录 |
| 代码仓库 | 完整源码，公开或给评审权限 | `xxy1103/powercontext-2026` / `qoder/` | 已推送 | 分支 `2026-competition-ecosystem`；仓库为私有，评审访问以提交表单中的仓库链接为准 |
| 运行说明 | 环境、依赖版本、seekdb/PowerContext 部署与接入、安装到启动 | `qoder/README.md` | 已完成 | 含依赖版本表与 Python <3.11 时的 `PYTHON=` 覆盖说明 |
| 验证样例 | 初始数据、输入、步骤、预期结果、技术作用记录 | `qoder/docs/VERIFICATION.md`、`qoder/scripts/verify.py`、`qoder/docs/verification/` | 已完成 | 两次 20/20 PASS，含干净房间证据 |
| Qoder 开发记录 | 关键对话截图/录屏 + Qoder 账号 UID | `qoder/docs/DEV_LOG.md`、`qoder/docs/dev-log/` | 已完成（录屏可选） | UID 已填；5 张真实 Qoder 对话截图已补 |
| 使用效果材料 | 人数、次数、提效对比、反馈 + 来源 | `qoder/docs/USAGE.md` | 未收集 | 目前 0 位真实外部用户，不虚构 |
| 配置示例 | 占位值，不含真实密钥 | `qoder/.env.example` | 已完成 | 已检查占位值与忽略规则 |

## 三、网站内容检查

- [x] 项目简介：一句话说清做什么、给谁用。
- [x] 解决的问题：真实痛点，不堆概念。
- [x] 核心功能：诊断、复习计划、答题反馈、记忆复用。
- [x] 技术结合：seekdb 与 PowerContext 各自在哪一步，附代码位置与验证证据。
- [x] 演示视频或截图：真实运行截图，未用生成图代替。
- [x] 代码仓库链接：站点页脚与“运行”区已链接 `xxy1103/powercontext-2026/tree/2026-competition-ecosystem/qoder`；仓库为私有，评审访问以提交表单中的仓库链接为准。
- [x] 运行说明入口：README 链接与本地运行命令。
- [x] 体验入口：明确写“本地运行”，无伪造在线试用。
- [ ] 使用效果数据：尚未收集，站点如实标注。
- [x] 移动端打开不崩；关键按钮可点（500/511px 与 1440px 实测）。

## 四、提交前最终检查

- [x] `qoder/` 已提交，未包含 `.venv/`、日志、密钥、缓存；仓库根目录其他未跟踪目录不属于 qoder 赛道。
- [x] `.env.example` 只有占位值；仓库与源码包中搜不到真实 Key/密码。
- [x] `README.md` 的每条命令都实际跑过（含干净房间安装）。
- [x] `scripts/verify.py` 从干净数据开始 PASS。
- [x] 网站已发布最新版本；评审结束前不暂停、不删除。
- [x] 用未登录的独立浏览器会话打开公开站点，确认无登录墙、五屏标签与下载链接可用。
- [x] 分支已推送：`2026-competition-ecosystem`；最终 commit hash 以提交表单填写时为准。
- [ ] 提交后保存提交成功截图。

## 五、容易踩的坑

- 企业版 Qoder 账号不能设公开访问；必须用个人账号发布 Sites。
- 只装组件/测试连接不算“技术结合”；必须有功能中的实际使用记录。
- 开发记录最后补容易缺证据；从 D1 开始截图/录屏。
- 不要把“全文检索”说成“向量检索”；当前能力按日志如实写。
- 不要编造使用人数、提效比例或用户评价；没有数据就写“尚未收集”。
- 项目网站不单独评分，但它是评审入口；信息完整、可复现优先。

## 六、可选：顺手多拿分

如果本项目已经导入了 powercontext 仓库、并按 seekdb 部署方式拿到 `run/telemetry.json` 的 `content.id`，可以同时提交：

- [ ] 「赛题一：准备 PowerContext 仓库」10 分（保留官方分支历史/导入仓库）。
- [ ] 「赛题一：部署一个 seekdb」10 分（提交 telemetry `content.id`）。

按各自判题口径提交；不要因为 Qoder 赛道而漏掉这两道基础题。
