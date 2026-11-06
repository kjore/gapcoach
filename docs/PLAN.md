# 知隙 GapCoach — Qoder 赛题完成计划

> 方向：学习教练  
> 周期：3–5 天冲刺（3 天最小可提交版，5 天完整版）  
> 赛道：Qoder × OceanBase 生态赛道，20 分  
> 工作目录：`qoder/`（仓库内目录）  
> 技术主线：seekdb 混合检索 + PowerContext 记忆

## 1. 一句话目标

做一个“越用越懂你”的复习教练：把课程资料和题库放进 seekdb，按语义、关键词和知识点混合检索；用 PowerContext 记住每个学习者的薄弱点、掌握度和复习进度；每次练习后更新记忆，下一次打开时直接给出针对性的复习计划。

## 2. 对齐赛题硬性要求

| 赛题要求 | 我们的做法 | 可核对证据 |
| --- | --- | --- |
| Qoder Sites 公开网站 | 用 `sites-building` 搭展示站，`sites-hosting` 发布，`sites-management` 设「任何人可访问」 | 公开 URL、访问统计截图 |
| 项目能运行 | FastAPI + 单页前端 + 本地 seekdb/PowerContext，提供一键 seed 和启动脚本 | README、`scripts/setup.sh`、`scripts/verify.py` |
| Qoder 开发可核对 | 从第一天记录需求拆解、编码、调试、验证过程；关键对话截图 + commit + spec/ticket | `qoder/docs/DEV_LOG.md`、`qoder/docs/dev-log/` |
| seekdb/PowerContext 真正生效 | seekdb 负责资料/题库检索与作答记录；PowerContext 负责薄弱点/进度记忆与跨会话复用 | SQL 查询结果、检索日志、记忆读写日志 |
| 代码资产在 `qoder/` | 所有项目文件只放在 `qoder/` 下 | 仓库目录结构 |

补充约束：

- 仓库基线：`oceanbase/powercontext` 的 `2026-competition-ecosystem` 分支；当前本地分支已正确。
- Qoder Sites 必须用**个人账号**发布，企业版账号不能设公开访问。
- 不提交真实 API Key、密码或凭据；配置只放占位值。
- 项目网站不单独评分，但它是评审入口；信息完整、可复现比炫技重要。

## 3. 产品定义

### 3.1 目标用户

需要反复复习、但不知道自己哪里薄弱的大学生/备考者。首个演示场景设为「数据库系统概论」课程，后续可替换为任意课程。

### 3.2 真实痛点

- 复习时从第一页重新看，时间花在已掌握的内容上。
- 错题和薄弱点散落在不同笔记、不同会话里，下次复习接不上。
- 不知道自己“会了什么、还差什么”，缺少可执行的下一步。

### 3.3 核心闭环

1. 学习者选择课程，完成 5 道诊断题。
2. 系统判分，识别薄弱知识点，并把薄弱点、掌握度、最近复习时间写入 PowerContext。
3. 系统基于记忆和 seekdb 检索，生成今天的复习计划（3 个知识点 + 5 道题 + 来源）。
4. 学习者逐题作答，系统给出答案、解析和来源引用。
5. 每次作答后更新掌握度与薄弱点；答错的知识点会提高下次出现权重。
6. 关闭再打开，PowerContext 恢复学习者的薄弱点和进度，继续给出下一步，而不是从零开始。

### 3.4 3 天最小版 vs 5 天完整版

**3 天最小版（必须保住）**

- 一门课程、一个学习者身份（localStorage 生成 learner_id，不做登录）。
- 诊断 → 复习计划 → 答题 → 反馈 → 进度条。
- seekdb：资料/题目导入 + 全文/关键词/知识点过滤；如果向量模型可用，加向量召回。
- PowerContext：薄弱点、掌握度、最近复习时间的写入与读取。
- 一个可执行的 `verify.py`，能证明“第一次答错 → 记忆写入 → 第二次计划包含该薄弱点”。
- Qoder Sites 展示站 + README + 运行说明 + Qoder 开发记录。

**5 天完整版（有时间再做）**

- 进度看板：掌握度雷达/列表、连续复习天数、错题趋势。
- 多课程导入（CSV/Markdown），课程切换。
- 来源引用可点击，展示原文片段。
- 可选的 LLM 个性化提示（没有 API Key 也能跑，模板解析兜底）。
- 空状态、错误状态、移动端适配、无障碍检查。
- 3–5 位真实用户试用 + 问卷/访谈 + 前后耗时对比。
- 可选的在线体验入口（Qoder Cloud Agents / Sites 后端）。

**明确不做**

- 账号体系、权限、多租户、支付。
- 复杂 PDF 解析、扫描件 OCR。
- 大规模题库、爬虫、实时协作。
- 依赖付费模型才能跑通的核心流程。

## 4. 技术方案

### 4.1 架构

```text
Browser (single-page app)
        │ HTTP/JSON
        ▼
FastAPI backend (Python 3.12)
   ├── seekdb (embedded via pyseekdb)
   │     materials / questions / attempts
   │     full-text + vector + scalar filters
   ├── PowerContext (local server / HTTP API)
   │     scope = learner:{id}:course:{id}
   │     weak points / mastery / progress / preference
   └── optional LLM adapter
         explanation & hint; 无 Key 时用题库解析
```

### 4.2 seekdb 负责什么

- 课程、知识点、资料片段、题目、作答记录。
- 混合检索：课程/知识点过滤（标量）+ 关键词/全文（text）+ 语义相似（vector）。
- 每次推荐题目时保留检索记录：查询词、命中题目 ID、分数、使用的过滤条件。
- 证据：`qoder/data/logs/seekdb_queries.jsonl`，以及 `verify.py` 输出。

### 4.3 PowerContext 负责什么

- 每个 `learner_id + course_id` 一个 Scope。
- 记忆条目（示例）：
  - `weak:{kp_id}`：薄弱点、错误次数、最近错误时间。
  - `mastery:{kp_id}`：掌握度 0–100、最近一次复习时间。
  - `pref:difficulty`：偏好难度。
  - `session:last`：上次学习到哪、下次建议。
- 每次答题后写入/更新；每次开始复习时读取，传入计划生成器。
- 证据：`qoder/data/logs/powercontext.jsonl`，以及 `verify.py` 输出中的记忆 revision。

### 4.4 前端页面

1. **Onboarding**：选择课程、输入昵称（生成 learner_id）。
2. **诊断**：5 道题，显示进度。
3. **今日复习**：薄弱点卡片 + 推荐题目 + 来源说明。
4. **答题反馈**：正确/错误、解析、来源、掌握度变化。
5. **进度**：知识点掌握度列表、连续天数、今日完成数。

3 天版可以先做 1–4；进度页用简单列表即可。

### 4.5 技术选择理由

- **Python 3.12 + FastAPI**：PowerContext 和 pyseekdb 都是 Python 生态，避免跨语言服务。
- **原生 HTML/CSS/JS**：无构建步骤，评审按 README 就能跑；3–5 天内比 React 更稳。
- **本地嵌入式 seekdb**：不需要 Docker，降低评审复现成本。
- **PowerContext 本地 server**：通过 HTTP API 接入，保留真实读写日志；不依赖 LLM 做显式记忆写入。

## 5. 数据与验证样例

### 5.1 样例课程

课程：`数据库系统概论`

知识点（5 个）：

1. 事务与 ACID
2. 索引与 B+ 树
3. SQL 查询与优化
4. 并发控制与隔离级别
5. 分布式一致性与复制

数据量：

- 30 道单选题（每个知识点 6 道，含答案、解析、难度、来源）。
- 10 段课程笔记/资料片段（Markdown，带 source 和 section）。
- 1 个演示学习者 `demo`。

### 5.2 验证脚本 `scripts/verify.py`

步骤：

1. 重建本地 seekdb 数据并导入样例课程。
2. 创建学习者 `demo`，完成诊断：故意答错「事务隔离级别」和「B+ 树索引」各 1 题，答对「SQL 查询」。
3. 断言 PowerContext 中写入 `weak:transaction_isolation` 和 `weak:bplus_index`。
4. 开启第二次会话，读取记忆，生成复习计划。
5. 断言计划包含上述两个薄弱点，且推荐题目来自 seekdb 检索结果。
6. 再答 3 题，断言掌握度发生变化、记忆 revision 增加。
7. 打印报告：seekdb 查询条数、命中题目、PowerContext 记忆 revision、计划内容。

预期输出（示例）：

```text
[1/6] seed seekdb ... ok (30 questions, 10 materials)
[2/6] diagnostic ... 2 wrong, 1 correct
[3/6] memory write ... weak:transaction_isolation, weak:bplus_index
[4/6] new session plan ... 2 weak points, 5 questions
[5/6] answer 3 questions ... mastery updated
[6/6] PASS
seekdb queries: 7
powercontext revisions: 5
```

## 6. 5 天排期

### D1：技术验证 + 数据层

- Gate 0：在 `qoder/.venv` 验证 `pyseekdb` 嵌入式启动、建表/写入/检索；验证 `powercontext` 本地 server 的显式记忆写入/读取。**这两个不通过，不进入 UI。**
- 写 `BRIEF.md`、`SPEC.md`、`DEV_LOG.md`。
- 建 `qoder/` 工程骨架、`.env.example`、`requirements.txt`、`setup.sh`。
- 导入样例课程数据；实现 seekdb 数据层和混合检索。
- 验收：`scripts/seed.py` 可重复执行；命令行能检索到指定知识点和题目。

### D2：记忆 + 核心闭环

- 实现 PowerContext memory adapter：写薄弱点、掌握度、进度；读回并生成计划。
- 实现 FastAPI 接口：`/api/profile`、`/api/diagnostic`、`/api/plan`、`/api/answer`、`/api/progress`。
- 实现前端 onboarding、诊断、今日复习、答题反馈四个页面。
- 验收：浏览器完成一轮诊断 → 计划 → 答题 → 反馈；重启服务后计划仍包含薄弱点。

### D3：进度页 + 验证 + 站点起步

- 加进度页（知识点掌握度、今日完成、连续天数）。
- 写 `scripts/verify.py` 并跑通；保存 seekdb/PowerContext 日志。
- 开始 `qoder/site/` 展示站：简介、问题、功能、截图、架构、技术结合、运行说明。
- 验收：`verify.py` PASS；网站本地预览可打开。

### D4：发布 + 真实用户

- 用 `sites-building` 完成站点，`sites-hosting` 发布，`sites-management` 设公开并打开访问统计。
- 找 3–5 位同学/同事按 `docs/TEST_SCRIPT.md` 试用，记录耗时、正确率、反馈。
- 修 Top 3 问题；补空状态/错误状态；跑 `design-qa` + `accessibility-review`。
- 验收：无痕窗口能打开网站；至少 3 条真实反馈。

### D5：提交包 + 缓冲

- 补齐 README：环境、依赖版本、seekdb/PowerContext 部署与接入、从安装到启动、验证样例、预期输出。
- 整理 Qoder 开发记录（截图/录屏、UID、时间线、关键 commit）。
- 更新网站使用效果数据；检查 `.env.example` 无真实密钥。
- 按 `SUBMISSION_CHECKLIST.md` 逐项验收；提交到测试平台。
- 留半天缓冲处理环境/发布问题。

### 如果只有 3 天

- D1：技术验证 + seekdb 数据层 + PowerContext 记忆。
- D2：核心四页 + 端到端跑通。
- D3：`verify.py` + Qoder Sites 展示站 + README + 提交。
- 砍掉：进度看板、图表、多课程、在线体验、复杂动效。

## 7. 提交物清单

| 材料 | 产出位置 | 状态 |
| --- | --- | --- |
| 项目网站 URL | <https://gapcoach-2pf0jobp824.qoder.zone> | 已发布并公开 |
| 代码仓库 | 仓库 `qoder/` 目录，分支 `2026-competition-ecosystem` | 已推送 |
| 运行说明 | `qoder/README.md` | 已完成 |
| 验证样例 | `qoder/scripts/verify.py` + 预期输出 | 已完成（20/20 × 2） |
| Qoder 开发记录 | `qoder/docs/DEV_LOG.md` + `qoder/docs/dev-log/` | 进行中（截图/录屏待补） |
| Qoder 账号 UID | `019e959e-97cb-717a-8eb0-66cab9d8499b`（账号持有人提供） | 已提供 |
| 使用效果材料 | `qoder/docs/USAGE.md` + 截图/问卷 | 未收集（0 位外部用户） |
| 配置示例 | `qoder/.env.example` | 已完成 |

## 8. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| PowerContext 本地 server 配置复杂/需要 LLM | 阻塞记忆接入 | D1 先验证显式记忆写入/读取；不需要 LLM；如果 server 起不来，改用 Python Client/内嵌 runtime，仍保留真实读写日志 |
| pyseekdb 在 macOS arm64 安装/运行失败 | 阻塞检索 | D1 先跑最小示例；失败则用 seekdb server 模式或 Node SDK；不伪造检索结果 |
| 向量模型下载失败 | 混合检索退化为全文+标量 | 先保全文+标量闭环；向量作为增强；在 README 明确当前能力，不把全文说成向量 |
| 3–5 天时间不足 | 做不完 | 按“3 天最小版”砍功能；先保证可运行、可演示、可提交 |
| Qoder Sites 公开访问设置失败 | 硬性验收失败 | 用个人账号；发布后用无痕窗口验证；保留访问统计截图 |
| 找不到真实用户 | 使用效果维度弱 | 先找 3 位同学/同事，准备 10 分钟测试脚本；没有数据就如实写“尚未收集”，不编造 |
| 开发记录缺失 | Qoder 开发实践维度弱 | 从 D1 开始每次关键对话截图/录屏；commit 与 spec/ticket 对应 |

## 9. 需要你提供/确认

1. **Qoder 账号 UID**：已提供 `019e959e-97cb-717a-8eb0-66cab9d8499b`，用于核对站点归属和使用记录。
2. **Qoder Sites 个人账号**：企业版账号不能设公开访问。
3. **3–5 位试用用户**：最好是你身边正在复习/备考的同学或同事。
4. **项目名**：暂定「知隙 GapCoach」，可以改。
5. **演示课程**：暂定「数据库系统概论」，可以换成你更熟悉的课程。
6. **可选 LLM API Key**：没有也能跑；有的话可以加个性化提示，但不是核心依赖。

## 10. 第一版目录结构

```text
qoder/
  README.md
  .env.example
  .gitignore
  requirements.txt
  docs/
    PLAN.md
    BRIEF.md
    SPEC.md
    DEV_LOG.md
    SUBMISSION_CHECKLIST.md
    TEST_SCRIPT.md
    USAGE.md
    dev-log/
  app/
    backend/
      main.py
      db.py
      seekdb_store.py
      memory.py
      planner.py
      models.py
    frontend/
      index.html
      app.js
      styles.css
  data/
    seed/
      knowledge_points.csv
      questions.csv
      materials.md
    logs/
  scripts/
    setup.sh
    seed.py
    verify.py
  site/
    index.html
    assets/
```

## 11. 验收口径（最终自检）

- [ ] 无痕窗口能打开 Qoder Sites 网站，不需要登录。
- [ ] 按 README 从零安装依赖、启动 seekdb/PowerContext、启动应用，能完成一轮诊断 → 计划 → 答题 → 反馈。
- [ ] `scripts/verify.py` 能复现“答错 → 记忆写入 → 下次计划包含薄弱点”。
- [ ] 网站和 README 能指出 seekdb、PowerContext 各自在哪个环节发挥作用，并给出日志/查询证据。
- [ ] 至少 3 条真实用户反馈，或如实说明未收集。
- [ ] 没有真实密钥/密码进入仓库。
- [ ] Qoder 开发记录包含关键对话截图/录屏和 UID。
