# 知隙 GapCoach

> 先诊断，再给证据，最后记住你。一个用 seekdb 找材料、用 PowerContext 记住学习者的复习教练。

**状态：可运行，端到端验证通过（2026-10-27）**。`scripts/verify.py` 用全新学习者跑完整链路，20/20 项断言通过，证据见 `data/verification/`。

**项目网站：<https://gapcoach-2pf0jobp824.qoder.zone>**（公开，无需登录；含真实运行截图、验证证据与可下载源码包）。

## 它解决什么问题

大多数题库只告诉你“对了几道”。但复习时真正难的是：

1. 我到底卡在哪个知识点，而不是哪一道题？
2. 下一次应该先看哪段材料，为什么是它？
3. 上次错的原因，能不能带到下一次，而不是重新开始？

知隙把这三件事串成一条闭环：

```text
10 题诊断 → 掌握度与薄弱点 → PowerContext 写入记忆
      ↓                              ↓
seekdb 混合检索材料与练习 ← 今日计划按薄弱程度排序
      ↓
作答 → 判分 + 原文证据 + 掌握度变化 → 新记忆 → 下次继续
```

## 60 秒跑起来

### 前置条件

- Python 3.11+（本项目在 3.12.14 上验证）
- macOS 或 Linux，能使用 `bash`、`curl`、`sed`
- 首次安装依赖需要网络；之后完全本地运行
- 不需要 LLM API Key：题库自带解析，PowerContext 的显式记忆接口也不需要模型服务

固定依赖版本见 [`requirements.txt`](requirements.txt)：

| 依赖 | 版本 | 作用 |
| --- | --- | --- |
| `pyseekdb` | 1.4.0.post1 | 嵌入式 seekdb：向量 + 全文 + 标量混合检索 |
| `powercontext[server,seekdb]` | 1.4.1 | 本地记忆服务 HTTP server |
| `fastapi` / `uvicorn` | 0.162.0 / 0.54.0 | 后端 API |
| `httpx` | 0.28.1 | 验证脚本与内部调用 |
| `python-dotenv` | 1.2.4 | 读取 `.env` |
| `typer` | 0.27.3 | PowerContext CLI 运行时依赖 |

### 三步

```bash
cd qoder
./scripts/setup.sh     # 创建 .venv、安装依赖、生成 .env、创建数据目录
./scripts/start.sh     # 启动 PowerContext（18080）与 GapCoach（8000）
```

如果 `python3 --version` 低于 3.11（macOS 自带版本常为 3.9），指定解释器再运行：

```bash
PYTHON=python3.12 ./scripts/setup.sh
```

打开 <http://127.0.0.1:8000>。首次打开输入称呼，开始 10 题诊断。

另开一个终端跑验证样例：

```bash
cd qoder
.venv/bin/python scripts/verify.py
```

预期结尾：

```text
VERIFY: PASS — 诊断 → 计划 → 答错 → 记忆 → 恢复，全链路可复现。
```

### 手动启动（与脚本等价）

```bash
cd qoder
cp .env.example .env
# 将 .env 里的 __PROJECT_ROOT__ 替换为本项目绝对路径
set -a; . ./.env; set +a

.venv/bin/powercontext server run --env-file .env &
.venv/bin/uvicorn app.backend.api:app --host 127.0.0.1 --port 8000
```

`start.sh` 会在 PowerContext 未运行时代为启动，并在退出时清理它启动的进程。

## 一轮完整体验

1. **入学诊断**：10 道题覆盖 5 个知识模块，每题可回看、键盘 `1–4` 选择、`Enter` 继续。
2. **诊断报告**：五个模块的掌握度、真正的薄弱点、为什么先补它，以及本次写入 PowerContext 的记忆。
3. **今日计划**：最多 3 组任务，按“掌握度低 + 最近错得多”排序；每组附 2 段 seekdb 检索材料和 2 道练习。
4. **练习反馈**：判分、解析、可引用的原文证据、掌握度变化、相似错题；答错会写入薄弱点记忆。
5. **学习进度**：掌握度、最近作答、PowerContext 记忆时间线、seekdb 与 PowerContext 的实际落点。
6. **技术轨迹**：每次检索与记忆写入的 `kind / action / detail`，可直接核对。

刷新页面会从本地会话恢复；重新输入同一称呼时，会通过 PowerContext 找回上次的学习状态。

## seekdb 做了什么

- 嵌入式运行（`pyseekdb` 1.4.0.post1），数据目录 `data/seekdb/`。
- 三个 collection：`materials`（15 段课程材料）、`questions`（30 道题）、`attempts`（作答记录）；`progress` 保存每个学习者的掌握度。
- `materials` 同时建立 HNSW 余弦向量索引与 IK 全文索引，查询使用 `hybrid_search` 的 RRF 融合，并按知识点做元数据过滤。
- 本地中文 embedding：字符 unigram + bigram + ASCII 词，经 blake2b 特征哈希到 384 维并 L2 归一化；注册名 `gapcoach-hash-v1`。没有调用外部 embedding 服务。
- 返回结果公开分数构成：`retrieval`（seekdb 召回）与 `weakness`（PowerContext 薄弱加权），便于核对。

## PowerContext 做了什么

- 本地 PowerContext 1.4.1 HTTP server（默认 `127.0.0.1:18080`），SQLite 后端。
- 每个“学习者 + 课程”一个 Scope；使用 `atomic-memory` 家族写入带 artifact 的记忆。
- 记忆类型：`weakness:<kp>`、`strength:<kp>`、`session:summary`、`plan:current`。
- 新会话先按学习者恢复 Scope，再检索记忆；薄弱点参与计划排序与检索加权。
- 掌握度 ≥ 85 且连对 ≥ 3 时，对应薄弱点记忆会走 lifecycle 解除，而不是永久贴着标签。
- PowerContext 离线时，诊断与练习仍可用，但跨会话记忆暂停，界面会明确提示。

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

## 验证样例

`scripts/verify.py` 会：

- 创建全新的 `verification-<时间>` 学习者，避免复用演示数据；
- 完成 10 题诊断，断言识别出预期的 2 个薄弱点（掌握度 26）；
- 断言 PowerContext 写入了 weakness / strength 记忆，且每条都有 artifact；
- 拉取计划，断言第一项是薄弱点、每组有 2 段材料与 2 道题、结果带 `score_parts`；
- 故意答错一道练习题，断言掌握度下降且反馈带 seekdb 原文证据；
- 断言进度页读取同一 Scope、答题记录落到 seekdb；
- 重新进入会话，断言从 PowerContext 恢复；
- 检查调用轨迹同时包含 seekdb 混合检索与 PowerContext 记忆写入。

每次运行都会写一份 `data/verification/verify-<timestamp>.json`，包含全部断言与响应摘要。验证不依赖浏览器截图。

一次「干净房间」复现（独立目录、全新 venv、端口 8100/18081）结果为 20/20 PASS，证据见 [`docs/verification/verify-clean-20261027-005528.json`](docs/verification/verify-clean-20261027-005528.json)。

逐步骤的初始数据、输入、预期结果与技术记录见 [`docs/VERIFICATION.md`](docs/VERIFICATION.md)。

## 目录

```text
qoder/
  app/
    backend/        FastAPI、seekdb store、教练逻辑、题库种子
    frontend/       原生 HTML/CSS/JS，无构建步骤
  scripts/
    setup.sh        创建环境与 .env
    start.sh        启动 PowerContext + 应用
    verify.py       端到端验证（20 项断言）
  docs/             计划、简报、规格、开发记录、提交清单
  site/             Qoder Sites 项目网站（静态）
  data/             运行时数据（已被 .gitignore 忽略）
```

## 配置

- 配置集中在 `.env`，模板见 `.env.example`，全部为本地占位值。
- 关键变量：`POWERCONTEXT_CLIENT_SERVER_URL`、`GAPCOACH_HOST`、`GAPCOACH_PORT`、`GAPCOACH_DATA_DIR`。
- `.env`、`data/`、`.venv/`、日志与截图运行时目录都不会提交。
- 如启用 PowerContext 访问控制，请在本机 `.env` 设置随机 token；不要把真实 token 写入示例或仓库。

## 常见问题

**8000 或 18080 被占用**：修改 `.env` 中 `GAPCOACH_PORT` / `POWERCONTEXT_SERVER_HTTP_PORT`，同时更新 `POWERCONTEXT_CLIENT_SERVER_URL`。

**PowerContext 起不来**：查看 `data/logs/powercontext.log`；确认 `.venv/bin/powercontext` 存在，或重新运行 `./scripts/setup.sh`。

**想清空本地学习数据**：先停止两个服务，再删除 `data/seekdb/` 与 `data/powercontext/`。重启后应用会自动重建课程、题库与索引；`data/powercontext/` 删除后，跨会话记忆也会清空。

**页面样式或脚本没更新**：后端对 `/` 与 `/assets` 返回 `no-store`；如仍看到旧模块，强制刷新一次。

## 文档

- [项目网站内容与结构](site/README.md)
- [验证样例（逐步）](docs/VERIFICATION.md)
- [Qoder 开发记录](docs/DEV_LOG.md) / [截图素材说明](docs/dev-log/README.md)
- [提交清单](docs/SUBMISSION_CHECKLIST.md)
- [使用与反馈记录](docs/USAGE.md)
- [产品简报](docs/BRIEF.md) / [核心规格](docs/SPEC.md)

## 依赖与来源

- seekdb 通过 `pyseekdb` 嵌入项目运行，PowerContext 通过官方 HTTP server 接入；两者均以依赖方式使用，未修改或复制其上游源码，许可证以各自上游仓库为准。
- FastAPI、uvicorn、httpx、python-dotenv、typer 通过 `pip` 安装，未修改上游源码。
- 课程材料与 30 道题为本项目自写的演示内容，不包含从教材或论文复制的原文；如需替换为真实课程资料，请自行确认版权。
- 项目站截图为真实浏览器运行结果，未使用生成图代替界面。

## 说明

- 本项目为本地优先应用：公开的 Qoder Sites 站点（<https://gapcoach-2pf0jobp824.qoder.zone>）用于项目说明、真实运行截图与源码包下载；完整体验需按上面的步骤在本地启动。
- 使用数据只记录真实发生的测试与反馈；没有收集到的数据不会用估算值代替。
- 所有示例配置均为占位值，不包含真实 API Key、密码或个人信息。
