# Qoder 开发记录

> 用途：记录「知隙 GapCoach」从需求拆解到可运行、可验证、可发布的过程，证明主要开发工作由 Qoder 参与完成。  
> 隐私：不记录真实 API Key、密码、个人信息。示例配置均为占位值。

## 账号与项目

- Qoder 账号 UID：`019e959e-97cb-717a-8eb0-66cab9d8499b`（由账号持有人提供，仅用于赛题身份核对）
- Qoder 版本 / 端：Qoder CN 桌面端
- 项目仓库：`xxy1103/powercontext-2026`，目录 `qoder/`，分支 `2026-competition-ecosystem`（已推送；仓库为私有，评审访问以提交表单中的仓库链接为准）
- 开发分支：`2026-competition-ecosystem`
- 项目目录：`qoder/`
- 项目网站：<https://gapcoach-2pf0jobp824.qoder.zone>（2026-10-27 发布，公开访问，无需登录）

## 一句话说明

知隙是一个“先诊断、再给证据、最后记住你”的学习教练：诊断找出薄弱知识点，seekdb 负责检索该看的材料与练习，PowerContext 负责跨会话记住学习者为什么需要复习它。

## Qoder 参与方式

| 环节 | Qoder 具体做了什么 | 可核对产出 |
| --- | --- | --- |
| 规则理解 | 读取赛道页面，拆出 20 分硬性验收、四类提交材料与评价维度；核对仓库分支与 `qoder/` 空目录 | `docs/PLAN.md`、`docs/SUBMISSION_CHECKLIST.md` |
| 能力盘点 | 核对已安装的 Skills/插件；加载 `design-review:ui-designer` 确定视觉系统，使用 `sites:sites-building` / `sites:sites-hosting` 发布项目站 | 本文件、`site/` |
| 技术选型 | 对比“全 LLM 生成”和“本地确定性链路”，选择后者以保证无 API Key 也能复现；确定 seekdb 嵌入式 + PowerContext HTTP + FastAPI + 原生前端 | `README.md`、`docs/SPEC.md` |
| 技术验证 | 先做 Gate 0：验证 pyseekdb 建库、建索引、混合检索，以及 PowerContext Scope / remember / search / lifecycle 最小闭环 | `scripts/gate0_check.py`、`data/gate0/` |
| 后端实现 | 生成并迭代 seekdb store、HashEmbedding、教练逻辑、诊断/计划/判分/进度/轨迹 API | `app/backend/` |
| 前端实现 | 按“温暖、专注、有编辑感”的方向实现 7 个视图；无构建步骤，便于评审直接运行 | `app/frontend/` |
| 浏览器调试 | 通过 browser-use MCP 实际点击完整流程，读取页面快照定位渲染问题；用 headless Chrome 生成桌面截图 | `site/assets/img/`、本文件“修复记录” |
| 验证 | 编写端到端脚本，用全新学习者驱动真实 HTTP API，断言 seekdb 与 PowerContext 都在做实际工作 | `scripts/verify.py`、`data/verification/verify-*.json` |
| 交付 | 用 Qoder Sites 构建公开项目站；README 与运行脚本从零可复现 | `site/`、<https://gapcoach-2pf0jobp824.qoder.zone> |

## 开发时间线

### 2026-10-26 — 规则理解与定题

- 阅读 Qoder 赛道页面，确认 20 分构成与提交要求。
- 核对仓库：分支 `2026-competition-ecosystem`，`qoder/` 仅有 `.gitkeep`。
- 盘点可用能力：`product-design`、`design-review`、`architecture-visualization`、`Grill Me`、`sites:*`、`browser-use`、`imagegen` 等。
- 与用户确认方向：学习教练；预算：3–5 天冲刺。
- 产出：`docs/PLAN.md`、`docs/BRIEF.md`、`docs/SPEC.md`、`docs/SUBMISSION_CHECKLIST.md`。

### 2026-10-27 — Gate 0：先证明两个内核能工作

- 创建 Python 3.12.14 的 `.venv`，安装 `pyseekdb==1.4.0.post1`、`powercontext[server,seekdb]==1.4.1`、FastAPI、httpx。
- 验证 pyseekdb：collection、HNSW 余弦索引、IK 全文索引、`hybrid_search` RRF、元数据过滤、`refresh_index()`。
- 验证 PowerContext：创建 Scope、写入 `atomic-memory`、按 Scope 检索、读取 artifact、lifecycle 解除。
- 关键结论：两条链路都能在没有模型 API Key 的情况下真实工作，适合做成可复现的本地应用。
- 产出：`scripts/gate0_check.py`、`requirements.txt`、`.env.example`、`docs/DEV_LOG.md`。

### 2026-10-27 — 数据层与检索

- 课程 `db-intro`《数据库系统概论》：5 个知识点、15 段材料、30 道题。
- 实现本地中文 embedding：字符 unigram + bigram + ASCII 词 → blake2b 特征哈希 → 384 维 L2 归一化，注册为 `gapcoach-hash-v1`。
- 实现 `materials` 混合检索：IK 全文 + 向量 + 知识点标量过滤，RRF 融合；返回 `retrieval` 与 `weakness` 分数构成。
- 实现 `attempts`、`progress` collection，答题与掌握度落盘 seekdb。

### 2026-10-27 — 核心闭环

- 诊断：10 题覆盖 5 个模块，记录每题选择，诊断后写入 weakness / strength 记忆。
- 计划：按掌握度与最近错误排序，最多 3 组；每组 2 段材料和 2 道练习。
- 判分：答对 +10（连对 ≥ 2 时 +15），答错 −15；返回解析、seekdb 原文证据、相似错题与记忆事件。
- 恢复：重新输入同一称呼时，先恢复 PowerContext Scope，再读取记忆与计划。
- 前端：原生 HTML/CSS/JS，7 个视图（首页、诊断、报告、计划、练习、进度、技术轨迹），无构建步骤。

### 2026-10-27 — 视觉系统与真实浏览器验收

- 使用 `design-review:ui-designer` 的方法建立设计系统：纸张底色、宋体标题、无衬线正文、等宽标签、深绿与焦橙、极少量圆角；不是通用 SaaS 模板。
- 用 browser-use MCP 实际走完：首页 → 10 题诊断 → 报告 → 计划 → 练习（答错）→ 进度。
- 用 headless Chrome 在 1440px 宽度下生成 6 张真实运行截图，放入项目站。
- 修复了一轮真实问题（见下节），而不是只做静态视觉稿。

### 2026-10-27 — 验证与交付

- `scripts/verify.py` 从全新学习者开始，20/20 项断言通过：
  - 15 段材料 / 30 道题加载；
  - 诊断识别 2 个薄弱点（26）；
  - 写入 weakness / strength 记忆且均有 artifact；
  - 计划第一项为薄弱点，2 段材料 + 2 道练习；
  - 答错后掌握度 26 → 11，反馈带 seekdb 原文证据；
  - 进度读取同一 Scope，答题记录落到 seekdb；
  - 重新进入会话从 PowerContext 恢复；
  - 轨迹同时包含 seekdb 与 PowerContext。
- 证据文件：`data/verification/verify-20261027-003641.json`（PASS，20/20）。
- 干净房间复现：把源码复制到独立目录、重建 venv、从空数据启动（应用 8100 / PowerContext 18081），`verify.py` 再次 20/20 PASS（2026-10-27 00:55:28）。期间发现两处真实安装问题并修复：
  - macOS 自带 `python3` 为 3.9，`setup.sh` 直接失败；README 增加 `PYTHON=python3.12` 覆盖说明。
  - `powercontext[server]` 的 extras 未包含 `typer`，`powercontext server run` 报 `ModuleNotFoundError`；在 `requirements.txt` 明确加入 `typer==0.27.3`。
- 干净房间证据（已去掉本机绝对路径）：`docs/verification/verify-clean-20261027-005528.json`。
- 项目站用 Qoder Sites 发布到 <https://gapcoach-2pf0jobp824.qoder.zone>，访问范围为「任何人都可访问」；公开 URL、验证 JSON 与源码包均返回 HTTP 200。
- 站点交互实测：五屏标签切换、截图 lightbox、复制按钮；窄屏 511px 与桌面 1440px 布局检查，无横向溢出。
- 构建 Qoder Sites 项目站，内容全部来自真实运行截图与验证结果。

## 修复记录（真实发生）

| 现象 | 原因 | 修复 |
| --- | --- | --- |
| 首页骨架条一直压在标题上 | 首页视图用 `append` 追加，没有替换骨架 | 改为 `replaceChildren` |
| 课程下拉为空 | `/api/courses` 返回 `{courses: [...]}`，前端读 `items` | 改读 `data.courses` |
| 未登录也显示学习者栏 | `.learner { display: flex }` 覆盖了 `hidden` | 增加全局 `[hidden] { display: none !important }` |
| 技术轨迹圆点始终灰色 | 读取了不存在的 `health.seekdb.ok` / `powercontext.ok` | 改读 `status === "ok"` / `online` |
| 报告把“未测”标成“薄弱” | 后端只按掌握度判断，未看 `answered` | 增加 `untested` 状态与“尚待测”标签 |
| 报告标题总是选第一个薄弱点 | weak 列表未按掌握度排序 | 升序排序后再取 `weak[0]`，并修正答题/正确数 |
| 练习页出现文字 `null` | 原生 `replaceChildren(null)` 会把 null 转成字符串 | 过滤空子节点后再挂载 |
| 练习提交后页面跳到中部 | 重绘时没有归零滚动 | 路由切换与完成页归零，答题时不重置 |
| 计划接口偶发 500 | pyseekdb 行归一化在并发读时抛 `IndexError` | 对读操作加重试，统计计数加锁 |
| 报告恢复后误报“PowerContext 未连接” | 报告只读诊断当次返回的 memory events | 无诊断上下文时改读 progress 的记忆时间线 |
| 截图显示旧 JS/CSS | 浏览器模块缓存 | 后端对 UI 与 `/assets` 返回 `no-store`，静态资源加版本参数 |

## 验证证据

- 端到端：`scripts/verify.py`，20/20 PASS。
- 证据 JSON：`data/verification/verify-20261027-003641.json`。
- 干净房间证据：`docs/verification/verify-clean-20261027-005528.json`（独立目录 + 全新 venv，20/20 PASS）。
- 逐步验证说明：`docs/VERIFICATION.md`（初始数据、输入、步骤、预期结果与技术记录）。
- Qoder 对话截图：`docs/dev-log/01-requirements-and-skills.png`、`02-plan-and-repo-check.png`、`03-build-and-debug.png`、`04-uid.png`、`05-audit.png`。
- 截图说明：`docs/dev-log/README.md`（录屏为可选项）。
- 项目站：<https://gapcoach-2pf0jobp824.qoder.zone>（公开；`/assets/evidence/verify.json` 与 `/assets/release/gapcoach-source.zip` 均可访问）。
- 真实截图（已用于项目站）：首页、诊断、报告、今日计划、练习反馈、学习进度、技术轨迹。
- 可复现命令见 `README.md`；不需要 LLM API Key。

## 未完成与边界

- Qoder 账号 UID 已由账号持有人提供（见文首），不在仓库里猜测或编造。
- 开发记录已补 5 张 Qoder 对话截图；2–3 分钟演示录屏为可选项，尚未录制。
- 3–5 位真实用户反馈尚在收集中；未收集前不使用虚构人数、提效比例或评价。
- 公开 Qoder Sites 是静态项目说明站；应用本身因使用嵌入式 seekdb 与本地 PowerContext，需要按 README 在本地启动。
- 仓库当前未提交/推送新代码；提交前需由仓库持有人确认分支、commit 与评审访问权限。

## 隐私与合规

- `.env`、`data/`、`.venv/`、日志与本地截图运行时目录不提交。
- 配置示例只含占位值；不包含真实 token、密码或个人信息。
- 站点与文档中的姓名（如“回归同学”）为验收时输入的测试称呼，不含真实身份信息。
