# 验证样例：诊断 → 计划 → 答错 → 记忆 → 恢复

> 对应赛题要求：至少一组可按步骤执行的样例，包含初始数据、输入、操作步骤、预期结果，以及 seekdb / PowerContext 发挥作用的记录。

## 1. 初始数据

| 项目 | 值 | 来源 |
| --- | --- | --- |
| 课程 | `db-intro`（数据库系统概论） | `app/backend/seed/content.json` |
| 知识点 | 5 个：事务、索引、SQL、并发、分布式 | 同上 |
| 材料 | 15 段（每个知识点 3 段） | 同上 |
| 题目 | 30 道（诊断抽 10 道，每个知识点 2 道） | 同上 |
| 学习者 | 每次验证新建，答题数为 0 | `scripts/verify.py` |
| seekdb | 嵌入式，数据目录 `data/seekdb/` | `pyseekdb` 1.4.0.post1 |
| PowerContext | 本地 HTTP server，SQLite 后端 | PowerContext 1.4.1 |

首次启动时，应用会把 `content.json` 写入 seekdb 的 `materials` / `questions` collection，并建立 HNSW 向量索引与 IK 全文索引。验证不依赖已有演示数据。

## 2. 环境与启动

```bash
cd qoder
PYTHON=python3.12 ./scripts/setup.sh   # python3 已 ≥ 3.11 时可省略 PYTHON
./scripts/start.sh
```

`start.sh` 会先启动 PowerContext（`127.0.0.1:18080`），再启动 GapCoach（`127.0.0.1:8000`）。健康检查：

```bash
curl -s http://127.0.0.1:8000/api/health
```

预期 `seekdb.materials = 15`、`seekdb.questions = 30`、`powercontext.online = true`。

## 3. 自动验证（推荐）

另开一个终端：

```bash
cd qoder
.venv/bin/python scripts/verify.py
```

脚本会用真实 HTTP API 新建学习者，执行完整链路，并写入 `data/verification/verify-<timestamp>.json`。

预期结尾：

```text
VERIFY: PASS — 诊断 → 计划 → 答错 → 记忆 → 恢复，全链路可复现。
```

预期断言：20 项全部 PASS。关键预期结果：

| 步骤 | 输入 | 预期结果 | 技术记录 |
| --- | --- | --- | --- |
| 加载 | 启动应用 | 15 段材料 / 30 道题 | `health.seekdb` |
| 建立会话 | 新称呼 | `answered = 0`，生成独立 `scope_id` | PowerContext Scope |
| 诊断 | 10 题：事务、索引、SQL 答对；并发、分布式答错 | 识别 2 个薄弱点，掌握度均为 26 | 诊断响应 `weak_points` |
| 写记忆 | 提交诊断 | weakness / strength 记忆均有 `artifact_id` | PowerContext `atomic-memory` |
| 计划 | 拉取 `/api/plan` | 第一项为薄弱点；每组 2 段材料 + 2 道练习 | seekdb `hybrid_search` + 知识点过滤 |
| 练习 | 故意答错 | 掌握度 26 → 11，反馈带 seekdb 原文证据 | `attempts` 落盘 + 记忆事件 |
| 进度 | 读取 `/api/progress` | 同一 Scope；共 11 次作答 | seekdb `attempts` / `progress` |
| 恢复 | 用同一称呼重新进入 | 返回原 `learner_id`，`has_history = true` | PowerContext 记忆读取 |
| 轨迹 | 读取 `/api/trace` | 同时出现 `seekdb/search_materials` 与 `powercontext/remember` | 应用调用轨迹 |

证据文件里可直接核对的字段：

- `diagnostic.weak_points`：2 条，`mastery = 26`；
- `diagnostic.memory_events`：包含 `weakness` / `strength` 与 `artifact.artifact_id`；
- `plan.items[0].materials[].score_parts`：包含 `retrieval` 与 `weakness`；
- `practice.mastery`：`[26, 11]`，`practice.evidence_ids` 非空；
- `progress.attempts.total = 11`，`progress.scope_id` 与会话一致；
- `resume.has_history = true`，`resume.last_plan` 非空；
- `trace` 同时包含 seekdb 与 PowerContext 条目。

两次独立运行的证据：

- `docs/verification/verify-20261027-003641.json`：开发机运行，20/20 PASS；
- `docs/verification/verify-clean-20261027-005528.json`：独立目录 + 全新 venv，20/20 PASS。

## 4. 手动 UI 验证

1. 打开 <http://127.0.0.1:8000>，输入一个新称呼（例如 `验收-1027`）。
2. 完成 10 题诊断：
   - 事务、索引、SQL 的题目选正确答案；
   - 并发、分布式的题目选错误答案。
3. 预期报告：2 个薄弱点（并发、分布式，掌握度 26），3 个优势知识点（掌握度 74）。
4. 进入「今日计划」：第一组应是薄弱点；每组有 2 段材料和 2 道练习。
5. 在练习中故意答错：预期掌握度下降 15，反馈显示解析、seekdb 原文证据、相似错题与记忆事件。
6. 打开「学习进度」：应看到 11 次作答、掌握度变化与 PowerContext 记忆时间线。
7. 刷新或重新输入同一称呼：应显示「欢迎回来」，并恢复上次 Scope 与计划。

## 5. 技术作用记录

### seekdb

- `materials`：15 段材料，HNSW 余弦向量索引 + IK 全文索引；
- `questions`：30 道题，按知识点过滤；
- 检索：`hybrid_search` 的 RRF 融合，返回 `retrieval` 与 `weakness` 分数构成；
- 落盘：`attempts` 保存每次作答，`progress` 保存掌握度；
- 可在「技术轨迹」或 `/api/trace` 中看到 `search_materials` 等真实调用。

### PowerContext

- 每个「学习者 + 课程」一个 Scope；
- 记忆类型：`weakness:<kp>`、`strength:<kp>`、`session:summary`、`plan:current`；
- 每条记忆带 artifact，可在诊断响应与进度页核对；
- 掌握度 ≥ 85 且连对 ≥ 3 时，薄弱点记忆走 lifecycle 解除；
- 重新进入会话时先恢复 Scope，再读取记忆与上次计划。

## 6. 常见问题

- **端口占用**：修改 `.env` 中的 `GAPCOACH_PORT` / `POWERCONTEXT_SERVER_HTTP_PORT`，并同步 `POWERCONTEXT_CLIENT_SERVER_URL`。
- **PowerContext 未启动**：查看 `data/logs/powercontext.log`，或重新运行 `./scripts/start.sh`。
- **验证脚本连错端口**：使用 `.venv/bin/python scripts/verify.py --base-url http://127.0.0.1:<端口>`。
- **想从空数据重来**：停止服务后删除 `data/seekdb/` 与 `data/powercontext/`，再启动。
