# 知隙 GapCoach — 核心规格

> 状态：D1 待实现  
> 目标：3 天可提交最小闭环，5 天完整体验  
> 原则：核心流程不依赖付费 LLM；seekdb 与 PowerContext 必须有可核对日志

## 1. 范围与假设

- 单机本地运行，评审按 README 复现。
- 单课程演示：`数据库系统概论`。
- 单学习者身份：前端 localStorage 保存 `learner_id`，不做登录。
- 数据规模：30 道题、10 段资料、5 个知识点。
- Python 3.12；seekdb 用嵌入式 `pyseekdb`；PowerContext 用本地 server/HTTP API。
- 可选 LLM 只用于提示/解释增强；没有 Key 时使用题库自带解析。

## 2. 用户故事与验收

### US-1 选择课程并开始诊断

**Given** 学习者首次打开应用  
**When** 选择「数据库系统概论」并输入昵称  
**Then** 系统创建 learner_id，展示 5 道诊断题，不提前暴露答案。

### US-2 诊断后识别薄弱点

**Given** 学习者完成 5 道诊断题  
**When** 提交答案  
**Then** 系统判分，至少识别 1 个薄弱知识点；把薄弱点、掌握度、最近复习时间写入 PowerContext；展示诊断结果。

### US-3 生成今日复习计划

**Given** 学习者已有记忆  
**When** 打开「今日复习」  
**Then** 系统读取 PowerContext 记忆 + seekdb 检索，返回 3 个薄弱点、5 道题和每道题的推荐理由；计划中至少包含 1 个上次的薄弱点。

### US-4 答题并更新记忆

**Given** 学习者在复习计划中作答  
**When** 提交答案  
**Then** 系统返回正确性、正确答案、解析、来源引用；更新该知识点的掌握度和薄弱点；写入 PowerContext。

### US-5 跨会话恢复

**Given** 学习者关闭浏览器/重启服务  
**When** 再次打开同一 learner_id + course_id  
**Then** 系统从 PowerContext 恢复薄弱点和进度，复习计划与上次衔接，不从零开始。

### US-6 查看进度

**Given** 学习者已完成至少一轮练习  
**When** 打开进度页  
**Then** 展示各知识点掌握度、今日完成数、连续复习天数、最近作答记录。

## 3. 页面

1. **Onboarding**：课程选择、昵称、开始诊断。
2. **Diagnostic**：5 题、进度条、上一题/下一题、提交。
3. **Today**：薄弱点卡片、推荐题目列表、每题的“为什么推荐”、开始复习。
4. **Practice**：题干、选项、提交、反馈（正确/错误、解析、来源、掌握度变化）、下一题。
5. **Progress**：知识点掌握度、今日完成、连续天数、最近记录。

3 天版可把 3/4 合并为一个页面，5 保留简单列表。

## 4. API 契约

所有接口返回 JSON；错误格式 `{ "error": { "code": "...", "message": "..." } }`。

### `GET /api/health`

返回：

```json
{
  "seekdb": { "ok": true, "mode": "embedded", "path": "data/seekdb" },
  "powercontext": { "ok": true, "base_url": "http://127.0.0.1:8765" },
  "version": "0.1.0"
}
```

### `GET /api/courses`

```json
[{ "id": "db-intro", "name": "数据库系统概论", "knowledge_points": 5, "questions": 30 }]
```

### `POST /api/session`

请求：

```json
{ "nickname": "小林", "course_id": "db-intro" }
```

返回：

```json
{ "learner_id": "uuid", "course_id": "db-intro", "memory_ok": true }
```

### `POST /api/diagnostic`

请求：

```json
{ "learner_id": "uuid", "course_id": "db-intro" }
```

返回 5 道题（不含答案）：

```json
{
  "session_id": "uuid",
  "questions": [
    {
      "id": "q-tx-01",
      "kp_id": "transaction",
      "kp_name": "事务与 ACID",
      "stem": "...",
      "options": ["A...", "B...", "C...", "D..."],
      "difficulty": 2
    }
  ]
}
```

### `POST /api/answer`

请求：

```json
{ "learner_id": "uuid", "course_id": "db-intro", "question_id": "q-tx-01", "selected": "B" }
```

返回：

```json
{
  "correct": false,
  "answer": "C",
  "explanation": "...",
  "source": { "title": "课程笔记 3.2", "section": "隔离级别" },
  "kp_id": "transaction",
  "mastery_before": 55,
  "mastery_after": 40,
  "weak_points": ["transaction"],
  "memory_revision": 3
}
```

### `GET /api/plan?learner_id=uuid&course_id=db-intro`

返回：

```json
{
  "weak_points": [
    { "kp_id": "transaction", "kp_name": "事务与 ACID", "mastery": 40, "reason": "上次错了 2 题" }
  ],
  "questions": [
    {
      "id": "q-tx-03",
      "stem": "...",
      "kp_id": "transaction",
      "reason": "你上次在「隔离级别」错了 2 题",
      "source": "课程笔记 3.2"
    }
  ],
  "memory_revision": 3
}
```

### `GET /api/progress?learner_id=uuid&course_id=db-intro`

```json
{
  "mastery": [{ "kp_id": "transaction", "kp_name": "事务与 ACID", "score": 40 }],
  "today_count": 8,
  "streak_days": 3,
  "recent_attempts": [
    { "question_id": "q-tx-01", "correct": false, "created_at": "2026-10-27T10:00:00Z" }
  ]
}
```

## 5. seekdb 数据模型（逻辑）

```sql
courses(id PK, name, description)
knowledge_points(id PK, course_id, name, description)
materials(id PK, course_id, kp_id, title, content, source, section, embedding)
questions(id PK, course_id, kp_id, stem, options_json, answer, explanation, difficulty, source, embedding)
attempts(id PK, learner_id, course_id, question_id, selected, correct, created_at)
```

索引/检索：

- 标量：`course_id`、`kp_id`、`difficulty`。
- 全文：`materials.content`、`questions.stem`、`questions.explanation`。
- 向量：`materials.embedding`、`questions.embedding`（若模型可用）。
- 混合分数：`0.5 * text_score + 0.3 * vector_score + 0.2 * weakness_boost`。
- 如果向量不可用：退化为 `0.7 * text_score + 0.3 * weakness_boost`，并在日志/README 标明。

## 6. PowerContext 记忆模型

- Scope：`gapcoach:{learner_id}:{course_id}`
- 记忆条目：

| Key | Value | 写入时机 |
| --- | --- | --- |
| `weak:{kp_id}` | `{ "errors": 2, "last_error_at": "...", "reason": "..." }` | 答错时 |
| `mastery:{kp_id}` | `{ "score": 40, "updated_at": "..." }` | 每次作答后 |
| `pref:difficulty` | `{ "level": 2 }` | 诊断后/用户调整 |
| `session:last` | `{ "question_id": "...", "next_kp": "...", "at": "..." }` | 每次答题后 |

- 读取：每次 `/api/plan` 前读取该 Scope 的全部记忆。
- 更新：`/api/answer` 成功后写入；保留 revision。
- 证据：`data/logs/powercontext.jsonl` 记录请求摘要、响应 revision、耗时；不记录密钥。

## 7. 计划生成规则

1. 读取记忆，筛出 `mastery < 60` 或 `errors >= 2` 的知识点。
2. 如果没有薄弱点：选 1 个新知识点 + 2 个已掌握知识点做间隔复习。
3. 用 seekdb 检索候选题：
   - 过滤：`course_id` + 目标 `kp_id` + `difficulty <= pref + 1`。
   - 排序：混合分数 + 薄弱点加权。
   - 排除：最近 2 次已答对的同题（除非到期复习）。
4. 选 5 题：3 题来自薄弱点，1 题来自已掌握知识点（间隔复习），1 题来自新知识点。
5. 为每题生成推荐理由：记忆原因优先，其次检索分数/来源。
6. 返回计划；不把答案返回给前端。

## 8. 掌握度更新

简单、可解释：

- 答对：`+10`，连续答对额外 `+5`（上限 100）。
- 答错：`-15`（下限 0）。
- `mastery < 60` 或最近一次答错 → 标记薄弱点。
- `mastery >= 85` 且连续 3 次答对 → 从薄弱点移除，转为间隔复习。

后续可替换为 Elo/BKT，但不影响演示。

## 9. 日志与证据

- `data/logs/seekdb_queries.jsonl`：查询词、过滤条件、命中 ID、分数、耗时。
- `data/logs/powercontext.jsonl`：scope、操作、key、revision、耗时。
- `data/logs/attempts.jsonl`：learner、question、correct、时间（可选，seekdb 已有）。
- `scripts/verify.py` 输出关键断言和摘要，供评审快速核对。

## 10. 错误与空状态

- seekdb 不可用：`503`，页面提示“数据库未启动”，附 README 链接。
- PowerContext 不可用：允许只读/临时本地记忆，但页面明确提示“记忆服务未连接”；不伪装成已保存。
- 无题目：空状态 + “导入题库”说明。
- 无薄弱点：展示“今天做间隔复习”而不是空白。
- 无效答案/题目：`400`，不写入记忆。

## 11. 非功能

- macOS arm64 + Python 3.12 可运行；不要求 Docker。
- 首次启动（不含模型下载）< 10 秒。
- 页面移动端可用；按钮/输入有 label；键盘可操作。
- 不记录真实密钥；`.env.example` 只放占位值。
- 所有项目文件在 `qoder/` 下。

## 12. 验证脚本断言

`scripts/verify.py` 必须：

1. seed 后题目数 = 30，资料数 = 10。
2. 诊断故意答错 `transaction` 和 `bplus_index` 各 1 题。
3. PowerContext 能读到 `weak:transaction` 和 `weak:bplus_index`。
4. 第二次 `/api/plan` 的 `weak_points` 包含这两个 kp。
5. 计划题目来自 seekdb 检索结果（日志中有对应 query）。
6. 再答 3 题后，至少一个 `mastery` 分数变化，PowerContext revision 增加。
7. 输出 PASS/FAIL 和证据摘要。

## 13. 待确认

- 项目名是否用「知隙 GapCoach」。
- 演示课程是否用「数据库系统概论」。
- Qoder 账号 UID：已提供 `019e959e-97cb-717a-8eb0-66cab9d8499b`。
- 3–5 位试用用户。
- 是否配置可选 LLM（不影响核心闭环）。
