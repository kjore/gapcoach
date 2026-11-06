# 知隙 GapCoach

> 先诊断，再给证据，最后记住你。一个可以直接在浏览器里玩的复习教练：混合检索找材料，学习记忆记住你的薄弱点。

**在线体验：<https://gapcoach-2i2bg8e17m0.qoder.zone>**（公开，无需登录，点开即用；发布至 Qoder Sites）

参加 **2026 Qoder 高校创造力大赛 · StudyHack 赛道**。本版本为纯静态在线 Demo：无后端、无数据库、无 API Key，所有检索与记忆逻辑在浏览器内运行，数据保存在 localStorage。

## 它解决什么问题

大多数题库只告诉你“对了几道”。但复习时真正难的是：

1. 我到底卡在哪个知识点，而不是哪一道题？
2. 下一次应该先看哪段材料，为什么是它？
3. 上次错的原因，能不能带到下一次，而不是重新开始？

知隙把这三件事串成一条闭环：

```text
10 题诊断 → 掌握度与薄弱点 → 写入学习记忆
      ↓                              ↓
浏览器内混合检索材料与练习 ← 今日计划按薄弱程度排序
      ↓
作答 → 判分 + 原文证据 + 掌握度变化 → 新记忆 → 下次继续
```

## 60 秒跑起来

### 在线（推荐）

直接打开 <https://gapcoach-2i2bg8e17m0.qoder.zone>，输入称呼，开始 10 题诊断。手机、平板、桌面浏览器均可。

### 本地

只需要 Node.js（或任意静态文件服务器），无构建步骤：

```bash
node scripts/serve.mjs        # 默认 http://127.0.0.1:8000
node scripts/serve.mjs 4173   # 或指定端口
```

`scripts/serve.mjs` 是零依赖静态服务器，根目录为 `app/frontend/`，带 no-store 缓存头，改完代码刷新即可看到。

## 一轮完整体验

1. **入学诊断**：10 道题覆盖 5 个知识模块，每题可回看、键盘 `1–4` 选择、`Enter` 继续。
2. **诊断报告**：五个模块的掌握度、真正的薄弱点、为什么先补它，以及本次写入学习记忆的内容。
3. **今日计划**：最多 3 组任务，按“掌握度低 + 最近错得多”排序；每组附 2 段检索材料和 2 道练习。
4. **练习反馈**：判分、解析、可引用的原文证据、掌握度变化、相似错题；答错会写入薄弱点记忆。
5. **学习进度**：掌握度、最近作答、记忆时间线、检索与记忆的实际落点。
6. **技术轨迹**：每次检索与记忆写入的 `kind / action / detail`，可直接核对；也可以输入任意问题现场跑一次混合检索。

刷新页面会从本地会话恢复；重新输入同一称呼时，会找回上次的学习状态。

## 引擎如何工作

原版使用 seekdb + PowerContext 本地后端（代码可从基线提交 `923c7a5` 找回，验证证据归档在 `docs/legacy/` 与 `docs/verification/`）。为了“点开即用”，这一版把同样的语义移植进了浏览器：

- **混合检索**（`engine/retrieval.js`）：全文通道（分词包含匹配）+ 向量通道（特征哈希 embedding 余弦相似度），RRF 融合；综合分数 = 检索分 × 0.72 + 薄弱加权 × 0.28，每条结果公开 `score_parts`，同一问题对不同学生排序不同。
- **中文 embedding**（`engine/embed.js`）：字符 unigram + bigram + ASCII 词 → FNV-1a 特征哈希 → 384 维 L2 归一化。无外部服务。
- **学习记忆**（`engine/memory.js`）：`weakness:<kp>`、`strength:<kp>`、`session:summary` 记忆，带 artifact 与 revision；掌握度 ≥ 85 且连对 ≥ 3 时薄弱记忆走解除，而不是永久贴标签。
- **进度存储**（`engine/storage.js`）：作答记录与掌握度落 localStorage，支持相似错题检索（错题向量余弦）。
- **教练逻辑**（`engine/coach.js`）：诊断选题、计划排序、判分反馈、跨会话恢复，规则与原版一致。

### 数据落点

| 数据 | 位置 |
| --- | --- |
| 题库（5 知识点 / 15 材料 / 30 题） | `app/frontend/assets/data/content.json`，随静态站分发 |
| 作答与掌握度 | localStorage `gapcoach.store.v1` |
| 学习记忆 | localStorage `gapcoach.memory.v1` |
| 会话状态 | localStorage `gapcoach.session.v1` |
| 调用轨迹 | 内存环形缓冲 200 条（技术轨迹页可查） |

## 掌握度规则

| 事件 | 变化 |
| --- | --- |
| 初始 | 50 |
| 诊断答对 / 答错 | +12 / −12 |
| 练习答对 | +10（连对 ≥ 2 时 +15） |
| 练习答错 | −15 |
| 范围 | 0–100 |
| 薄弱 | < 60 且已作答 |
| 稳固 | ≥ 85 且连对 ≥ 3 |

## 目录

```text
gapcoach/
  app/frontend/          整个应用：原生 HTML/CSS/JS，无构建步骤
    assets/js/engine/    浏览器内引擎（检索、记忆、存储、教练）
    assets/js/views/     7 个视图
    assets/data/         题库与课程材料
  scripts/serve.mjs      零依赖本地静态服务器
  docs/                  简报、规格、开发记录、提交清单、旧版归档
  data/                  本地运行产物（已被 .gitignore 忽略）
```

## 常见问题

**想清空学习数据**：浏览器控制台执行 `localStorage.clear()`（或只删 `gapcoach.*` 三个键），刷新即可。

**换设备后进度不见了**：数据存在浏览器 localStorage，不跨设备同步；同一浏览器重新输入相同称呼可找回。

**页面样式或脚本没更新**：本地 `serve.mjs` 已带 no-store；线上强制刷新一次。

## 文档

- [Qoder 开发记录](docs/DEV_LOG.md)（含 2026-11 在线版重构章节）
- [大赛提交清单](docs/SUBMISSION_CHECKLIST.md)
- [产品简报](docs/BRIEF.md) / [核心规格](docs/SPEC.md)
- [旧版（PowerContext 赛道）验证归档](docs/legacy/verify-powercontext-era.json)

## 说明

- 本课程的材料与 30 道题为自写演示内容，不包含从教材或论文复制的原文。
- 站点不收集访问者个人信息，不接入第三方统计；所有数据只存在你自己的浏览器里。
- 项目主要开发工作由 Qoder 完成，过程见 `docs/DEV_LOG.md` 与 `docs/dev-log/` 截图。
