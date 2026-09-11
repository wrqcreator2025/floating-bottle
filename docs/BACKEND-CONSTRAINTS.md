# 《漂流瓶》后端实现约束 v0.1

> 技术栈：Gin + MySQL  
> 上游契约：`docs/API.md`  
> 产品边界：`docs/PRD.md` 与 `PRODUCT_CONSTRAINTS.md`  
> 知乎上游协议：`zhihu/references/hackathon-oauth.md`、`user-api.md` 与 `http-api.md`  
> 用途：约束后端实现、数据库设计、测试和代码评审，不改写接口语义。

## 1. 实现目标

1. 严格实现 `/api/v1` 契约，不让前端根据数据库表结构猜测业务状态。
2. 保证瓶子可重复创建且独立保存、累计数量不限，但同一用户同时最多有 10 个主动寻找中的瓶子。
3. 将瓶子、邀请、短连接和长期经历分开建模，禁止用一张大表承载所有状态。
4. 支持异步匹配与通知，不把「抛出瓶子」伪装成同步实时找人。
5. 保持代码和依赖简单，不为黑客松 MVP 引入 Redis、独立消息队列、微服务、分布式事务或复杂规则引擎。

同一瓶子可同时被多人接住并分别回信。Bottle 与 Invitation、Connection 均为一对多；每用户 10 个主动寻找名额只限制并行搜索的瓶子数量。

## 2. 固定技术选择

### 2.1 Go 与 Gin

- Go 版本由 `go.mod` 唯一固定，CI 和部署使用同一版本。
- HTTP API 固定使用 Gin，不再同时维护 `net/http.ServeMux` 或另一套路由框架。
- MySQL 访问使用 `database/sql` 和维护活跃的 MySQL driver。
- 首版直接编写显式 SQL，不引入 ORM 或 `sqlc`；以后如需调整，先更新本文档。
- 日志使用 `log/slog` 结构化输出。
- 所有 handler、service 和 repository 方法均传递 `context.Context`。

### 2.2 MySQL

- 使用支持 InnoDB、`utf8mb4` 和 JSON 类型的 MySQL 8.x。
- 字符集统一为 `utf8mb4`；排序规则在首个 migration 中固定，所有环境相同。
- 数据库会话时区设为 UTC，对外时间统一输出 RFC 3339 UTC。
- 表引擎统一使用 InnoDB。
- 不使用存储过程、数据库触发器或在多处复制的业务逻辑。

### 2.3 进程形态

首版保持一个仓库、两个可执行入口：

- `api`：HTTP API、认证、读写业务数据。
- `worker`：匹配、邀请过期、通知、AI 整理和经验切片任务。

两者共用同一套 `internal/` 代码和 MySQL。首版不拆独立微服务。

### 2.4 消息队列与缓存

- 首版基础设施只使用 Gin 应用和 MySQL，不引入 Redis、RabbitMQ、Kafka、NATS 或其他独立消息队列。
- 必须异步执行的少量任务使用 MySQL `outbox_jobs` 表持久化，由同仓库 Go worker 消费；该方案仍属于 Gin + MySQL 技术边界。
- 不用仅存在于内存中的 goroutine 代替可靠任务：进程退出后仍需执行的任务必须先落库。
- 只有实际压测、任务积压或跨服务事件分发证明 MySQL 任务表不足时，才单独评估消息队列，并先更新本文档。

## 3. 目录结构

开始后端实现时使用：

```text
backend/
├── cmd/
│   ├── api/main.go
│   └── worker/main.go
├── internal/
│   ├── config/
│   ├── httpapi/          # Gin 路由、handler、middleware、JSON 映射
│   ├── service/          # 用例和事务边界
│   ├── domain/           # 状态常量与少量业务规则
│   ├── repository/mysql/ # SQL 与行映射
│   ├── matching/         # 匹配候选与排序
│   ├── ai/               # AI provider 适配层
│   ├── zhihu/            # OAuth、上游 HTTP client 与响应映射
│   ├── auth/
│   └── jobs/
├── migrations/
├── tests/
├── go.mod
├── go.sum
└── README.md
```

不建立只有一个实现的「通用 Repository」、「通用 Service」或反射 CRUD 框架。接口应按测试替身和真实边界创建，不为分层而分层。

## 4. HTTP 层约束

1. handler 只负责解析请求、最小字段校验、调用 service 和映射响应。
2. handler 不直接执行 SQL，不负责匹配排序，不在多个路由中手写状态流转。
3. 请求体使用各接口专用 struct，不直接将数据库 model 暴露为 JSON。
4. JSON 字段使用 `camelCase`，错误码使用稳定的 `UPPER_SNAKE_CASE`。
5. 通用 middleware 仅保留：请求 ID、访问日志、panic recovery、认证、CORS 和必要的限流。
6. 默认请求体上限为 1 MiB；当前产品没有文件上传接口。
7. 所有响应遵守 `docs/API.md` 的 `data` / `error` 结构，不同时维护另一套内部响应格式。
8. 前端动画提示使用文档定义的 `interaction`，后端不传动画时长、坐标或 Three.js 参数。

## 5. 最小校验策略

不进行过多检查。各层只负责一类约束：

| 位置 | 校验范围 |
| --- | --- |
| HTTP 边界 | JSON 可解析、必填、字段类型、枚举、`docs/API.md` 中的长度上限 |
| Service | 资源归属、当前状态是否允许此次转换、每用户最多 10 个主动寻找名额 |
| MySQL | `NOT NULL`、主键、外键、必要唯一索引和事务一致性 |
| 内容理解层 | 是否属于经历问题、高风险分流、经历/观点条件拆分 |

明确禁止：

- 在 handler、service、repository 重复 trim、长度和枚举校验。
- 为所有字段编写复杂正则，或对普通自然语言做过度格式限制。
- 在每次读取时重新跑 AI 安全或语义分类。
- 为了「防御性编程」把同一个数据库查询执行多次。
- 返回前端无法采取行动的大量细分错误码。

## 6. 数据库模型

### 6.1 核心表

| 表 | 职责 | 关键字段 |
| --- | --- | --- |
| `users` | 本地用户主体 | `id`, `external_subject`, `created_at`, `updated_at` |
| `zhihu_integrations` | 用户的知乎授权与同步状态 | `user_id` PK, `oauth_token_ciphertext`, `oauth_expires_at`, `status`, `last_synced_at`, timestamps |
| `bottles` | 发送者的求助瓶子 | `id`, `owner_id`, `episode_raw`, `episode_title`, `episode_confirmed`, `target_hint`, `target_rules`, `content_version`, `search_round`, `status`, `failure_reason`, `launched_at`, timestamps |
| `active_search_slots` | 用户正在占用的主动寻找名额 | `(user_id, bottle_id)` PK, `bottle_id` UNIQUE, `created_at`；Go 事务限制每用户最多 10 行 |
| `experiences` | 长期「我走过的经历」 | `id`, `owner_id`, `title`, `body`, `confirmed_by_user`, `receive_open`, `disclosure`, `source`, timestamps |
| `match_invitations` | 一次瓶子投递给一位接收者 | `id`, `bottle_id`, `search_round`, `recipient_id`, `matched_experience_id`, `experience_snapshot`, `reason`, `status`, `expires_at`, `decided_at`, timestamps |
| `connections` | 接住后建立的有限对话 | `id`, `bottle_id`, `invitation_id`, `seeker_id`, `responder_id`, `status`, `follow_up_used`, `closed_at`, timestamps |
| `messages` | 回信、一次追问和追问回复 | `id`, `connection_id`, `sender_id`, `sequence_no`, `body`, `created_at` |
| `connection_feedback` | 发送者对单段连接的结果反馈 | `connection_id` PK, `seeker_id`, `result`, `created_at` |
| `notifications` | 异步事件的用户通知 | `id`, `event_key`, `user_id`, `type`, `resource_type`, `resource_id`, `title`, `read_at`, `created_at` |
| `slice_drafts` | 经用户同意后生成的脱敏经验切片 | `id`, `connection_id`, `author_id`, `title`, `body`, `status`, timestamps |
| `experience_suggestion_jobs` | 知乎搜索与经历建议任务 | `id`, `user_id`, `query`, `status`, `suggestions`, `last_error`, timestamps |
| `user_activity_profiles` | 用户知乎活动的结构化匹配画像 | `user_id` PK, `features`, `source_types`, `source_updated_at`, `refreshed_at`, `expires_at`, `profile_version` |
| `outbox_jobs` | 事务后的匹配、AI 和通知任务 | `id`, `type`, `payload`, `status`, `attempts`, `available_at`, `locked_at`, `locked_by`, `completed_at`, `last_error`, timestamps |
| `external_api_cache` | 知乎用户数据与搜索响应缓存 | `provider`, `capability`, `request_hash`, `response`, `expires_at`, timestamps |
| `external_api_usage` | 用户每日实际外部调用计数 | `user_id`, `provider`, `capability`, `usage_date`, `request_count`, timestamps |

### 6.2 建模约束

- 业务 ID 由 Go 应用生成不透明、时间友好的字符串，对外不暴露自增整数。
- 建议所有业务 ID 使用 `BINARY(16)` 存储 UUID/ULID 等价值，在 repository 层与 API 字符串互转；若团队优先追求开发速度，可统一使用 `CHAR(26)`，但不混用。
- 状态列使用 `VARCHAR`，Go 中定义类型常量；不使用难于迁移的 MySQL `ENUM`。
- `target_rules`、`disclosure`、`payload` 和 `scopes` 可使用 JSON；用于归属、状态、排序和关联的字段必须使用普通列，不藏在 JSON 中。
- 用户原始文字与 AI 整理结果分列保存，不用 AI 输出覆盖用户原文。
- `failure_reason` 只保存稳定业务原因或脱敏技术错误码。`match_failed` 使用 `no_candidates/all_declined_or_expired`；`search_error` 不复用这两个原因。
- `user_activity_profiles.features` 只保存匹配需要的结构化主题、阶段线索和语义向量，不长期复制完整关注列表或公开内容正文。原始外部响应仅在短期缓存中保存。
- 活动画像不能自动写入 `experiences`；经历仍以用户本人填写或确认的数据为准。
- `created_at` 一旦写入不修改；`updated_at` 由应用或数据库采用一种统一策略更新，不混用。
- 核心私人文本不进入 MySQL general log、slow log 参数展开或应用访问日志。

### 6.3 必要索引

```text
bottles(owner_id, created_at DESC)
bottles(owner_id, status, updated_at)
experiences(owner_id, updated_at DESC)
experiences(receive_open, updated_at)
match_invitations(recipient_id, status, created_at)
match_invitations(bottle_id, status, created_at)
UNIQUE match_invitations(bottle_id, recipient_id)
UNIQUE connections(invitation_id)
UNIQUE connections(bottle_id, responder_id)
UNIQUE messages(connection_id, sequence_no)
notifications(user_id, read_at, created_at)
UNIQUE notifications(event_key)
UNIQUE slice_drafts(connection_id)
experience_suggestion_jobs(user_id, created_at DESC)
user_activity_profiles(expires_at)
outbox_jobs(status, available_at)
UNIQUE external_api_cache(provider, capability, request_hash)
UNIQUE external_api_usage(user_id, provider, capability, usage_date)
```

只为已有查询和唯一性约束建索引。不预先为每个字段建索引；新索引应由实际 SQL 与 `EXPLAIN` 支持。

禁止对 `connections.bottle_id` 单独建立唯一索引。不同接收者可分别建连接，同一接收者对同一瓶子最多建立一次连接。

### 6.4 瓶子柜不单独建业务表

瓶子柜是查询视图，不是独立的真实来源：

- 已发出：查询当前用户已抛出的 `bottles`，每瓶一条，详情列出其全部连接摘要；不包含草稿。
- 已接收：查询当前用户作为 responder 的 `connections` 与对应瓶子快照。
- 未读状态：由 `notifications` 或连接阅读位点表示，不复制整个瓶子记录。
- 已放行邀请不出现在柜子中。

## 7. 状态流转约束

### 7.1 瓶子

```text
draft → searching → completed / match_failed / search_error
             └→ paused → searching
match_failed / search_error → searching（retry）
```

- 只有瓶子所有者可修改 `draft`。
- `launch` 必须在一个事务中锁定用户行、确认其 `active_search_slots` 少于 10、取得新名额、将瓶子转为 `searching` 并写入 outbox 任务。
- 瓶子仅记录寻找状态，回信、追问和封存只更新各自连接。首次接住不停止其他投递、不释放主动寻找名额。
- 瓶子进入 `completed`、`match_failed`、`search_error` 或 `paused` 时释放名额。暂停仅停止新增投递，已送达的未过期邀请仍可决策；已有连接照常交流。
- 达到投递上限或候选耗尽且不存在 pending 邀请后，有过 accepted 邀请则 `completed`，否则 `match_failed`。仍有 pending 时保持 searching；paused 不因邀请决策自动恢复或结束，resume 后重新判断。
- `match_failed` 只表示没有候选或所有邀请均拒绝/过期。后台任务连续失败使用 `search_error`，不得把技术故障解释成无人愿意接住。
- retry 将 `search_round` 加一并重新取得主动名额；当前轮尝试数从新 round 计算，历史邀请和连接保留，且不再次投递给历史接收者。
- 状态更新带当前状态条件，如 `UPDATE ... WHERE id=? AND status='draft'`；影响行数为 0 时映射为 `409`。

### 7.2 邀请

```text
pending → accepted
        ├→ declined_not_now
        ├→ declined_not_mine
        └→ expired
```

- 一条邀请只能决策一次。
- `accept` 在同一事务内将当前邀请改为 `accepted`、创建该接收者的 connection 并写通知；不停止其他邀请。
- `not_now` 或 `not_mine` 只结束当前邀请，不改变其他邀请或连接。瓶子处于 searching 时写入匹配 outbox 任务，用于补充投递或判断寻找是否结束。
- 拒绝不产生用户信用、积分或处罚字段。
- 邀请创建时 `expires_at=created_at+72h`。决策必须在同一条件更新中检查接收者、`pending` 和 `expires_at > UTC_TIMESTAMP()`；已过期返回 `409 INVITATION_EXPIRED`。

### 7.3 短连接

```text
awaiting_first_reply → awaiting_follow_up → awaiting_second_reply → closed
                                └→ closed
```

- responder 只能在 `awaiting_first_reply` 发送首封回信。
- seeker 对每个 connection 最多发送一次追问，成功后该连接的 `follow_up_used=true`，不占用其他连接的额度。
- responder 回复追问后连接自动 `closed`。
- 任一方可主动关闭当前连接，不影响同瓶其他连接和寻找状态。反馈、未读、经验切片也按连接独立处理，不扩展为群聊或无限私聊。
- 首版 `awaiting_first_reply` 不自动过期。不要增加一个未在 API 契约中体现的后台关闭任务。

## 8. 关键事务边界

仅在必须同时成功的业务转换中使用事务：

### 8.1 抛出瓶子

1. 使用 `SELECT ... FOR UPDATE` 锁定发送者的 `users` 行，使同一用户的名额变更串行执行。
2. 统计该用户的 `active_search_slots`；达到 10 时返回 `409 ACTIVE_BOTTLE_LIMIT_REACHED`。
3. 插入当前瓶子的 `active_search_slots`。
4. 将目标瓶子从 `draft` 更新为 `searching`。
5. 写入 `outbox_jobs(type='match_bottle')`。
6. 提交。

同一用户的 launch、resume、retry 和释放名额操作必须遵守相同的“先锁用户行、再锁瓶子行”顺序，避免死锁，并防止两个并发请求同时越过上限。对已经 `searching` 的同一瓶重复请求仍视为幂等成功，不重复占用名额或创建任务。

### 8.2 接住邀请

1. 使用条件更新将当前用户的 `pending` 且未过期邀请改为 accepted。
2. 创建该邀请唯一的 `connection`；不同接收者的并发 accept 均可成功。
3. 若瓶子仍在 searching，写入匹配 outbox 任务以推进剩余投递或判断结束；不得因首次接住直接释放名额。
4. 写入通知 outbox。
5. 提交。

### 8.3 发送回信或追问

1. 条件更新 `connections.status`。
2. 使用 `sequence_no` 插入消息。
3. 写入对方通知 outbox。
4. 提交。

不在事务持有期间调用 AI、短信、推送或其他网络服务。

### 8.4 失败后重试

1. 条件更新并锁定 `match_failed/search_error` 的瓶子。
2. 锁定用户行并确认当前主动名额少于 10，再插入 `active_search_slots`；达到上限映射为 `409 ACTIVE_BOTTLE_LIMIT_REACHED`。
3. 如请求包含新目标则更新目标，递增 `content_version`；始终递增 `search_round` 并清空 `failure_reason`。
4. 将瓶子更新为 `searching`，写入新的 `match_bottle` outbox 任务并提交。

历史 Invitation 不删除。worker 按 `bottle_id + search_round` 统计本轮人数，并用 `UNIQUE(bottle_id, recipient_id)` 排除曾经收到过该瓶子的用户。
若 retry 到达时该瓶已是 searching 且主动名额仍指向它，返回当前 round，不再递增或新增任务。

### 8.5 异步内容任务

- 创建经验切片时，在一个事务中校验 responder 与连接状态、插入或更新 `slice_drafts(status='generating')` 并写入 outbox。重复请求返回该连接现有草稿；failed 草稿可原地重试。
- worker 生成完成后只更新同一 slice 为 ready；发布时条件更新 `ready → published`。原始对话不复制到公开记录。
- 创建公开表达经历建议时插入 `experience_suggestion_jobs(status='processing')` 和 outbox；worker 完成后写入结构化 suggestions。前端只查询业务任务表，不接触 outbox ID。

## 9. 并发与幂等

1. 重复点击 launch、decision、message 不得创建重复连接或消息。
2. 幂等优先依靠状态条件更新和唯一索引，不额外建立通用「请求幂等平台」。
3. 若前端重试发送消息，可携带 `Idempotency-Key`；服务端仅对这类高价值写操作保存短期幂等结果。
4. decision、close、feedback 和 notification read 重复提交相同动作时返回已有结果；同一资源上的不同动作冲突返回 `409`。
5. 通知在业务事务中落库，使用稳定 `event_key` 和唯一索引去重；worker 重试不能产生重复通知。

### 9.1 Outbox 生命周期

```text
pending → processing → succeeded
                  ├→ pending（短暂失败且未达上限）
                  └→ failed（达到上限）
```

1. worker 在短事务中通过 `SELECT ... FOR UPDATE SKIP LOCKED` 取得到期的 pending 任务，写入 `processing`、`locked_at`、`locked_by` 并增加 attempts，提交后才执行任务。
2. `processing` 超过 5 分钟视为租约失效，可被其他 worker 重新认领。任务处理必须幂等，不持有数据库锁调用 AI 或外部接口。
3. 短暂失败使用带 jitter 的指数退避，最长 30 分钟；单个任务最多尝试 5 次。参数、权限等永久错误直接进入 failed。
4. `match_bottle` 最终 failed 时，若 Bottle 仍是该任务对应 round 的 searching，则改为 `search_error`、释放主动名额并创建 `search_error` 通知。其他类型任务按各自资源写入 failed 状态并告警。
5. `last_error` 只保存短错误码和脱敏摘要。任务成功写入 `succeeded/completed_at`；定期清理已完成的旧任务。

### 9.2 恢复扫描

worker 启动时执行一次、运行期间每分钟执行一次轻量扫描：处理已过期邀请，重新认领超过 5 分钟的 processing 任务，并检查 searching 瓶子是否缺少可执行的匹配任务。扫描只补写带唯一业务键的任务，不直接调用外部服务；因此进程重启不会丢失异步流程，也不会重复投递。

## 10. 异步匹配

### 10.1 输入

- 一个 `searching` 瓶子。
- 由发送者问题、可选目标提示和发送者活动画像整理并经用户确认的必须经历、优先经历和观点偏好。
- 候选用户 `receive_open=true` 的本人确认经历，以及候选用户最近可用的活动画像。
- 已尝试或已拒绝的接收者集合。

### 10.2 候选与排序

1. 先以候选人本人确认且开放接收的 Experience 检查必须经历；不允许仅凭活动信息让候选人通过硬条件。
2. 对通过硬条件的人，AI 综合 Experience 正文、发送者与接收者的活动画像、优先经历和观点偏好进行语义排序。
3. 活动画像可以帮助理解主题、阶段和表达语境，不能自动确认人生经历。观点只是软偏好，不得变成硬筛选。
4. 学校、公司、粉丝数、权威度、点赞数和评论数不作为人的排序权重；这些互动数据最多用于判断某条公开内容是否值得纳入画像。
5. 邀请中的 reason 只能说明匹配到的本人确认经历，不披露双方的原始知乎活动、关注关系或内部评分。
6. 不返回候选人列表；worker 可同时向多位符合条件的接收者生成邀请，不等待前一人拒绝或回信。
7. 单瓶累计有限尝试 3–5 位不同接收者，上限为服务端配置，不由前端传入；已接住的人也计入，首次接住不提前停止其他投递。排除发送者本人。
8. 创建邀请前在短事务中锁定瓶子行，检查 searching 状态及剩余名额，再插入邀请；唯一索引防止向同一人重复投递。暂停及寻找结束同样锁定瓶子行，避免暂停后新增投递或并发超额。候选计算和 AI 排序在事务外执行。

活动画像缺失、过期且刷新失败时，仍使用“发送者问题与确认目标 + 接收者已确认 Experience”匹配，并记录 `activity_profile_unavailable`，不把外部接口故障转成 `match_failed`。

### 10.3 邀请过期与状态收尾

1. 邀请默认有效 72 小时。worker 分批将 `pending AND expires_at <= UTC_TIMESTAMP()` 条件更新为 `expired`。
2. 用户 decision 与过期任务竞争时，以首先成功的条件更新为准；不得先读状态再决定写入。
3. 每批过期后为相关 searching 瓶子写入去重的 `match_bottle` 任务，用于补充投递或判断最终状态。
4. 达到投递上限但仍有 pending 邀请时保持 searching；最后一条 pending 结束后，有 accepted 则 completed，否则 match_failed，并释放主动名额、写通知。

### 10.4 放行后继续漂流

`not_now`、`not_mine` 或邀请过期后：

1. 记录邀请结果。
2. 不创建 connection，不创建接收者柜子记录。
3. 瓶子仍在 searching 且尝试数未达上限时可补充投递；paused 不新增投递。已拒绝用户不重复投递。
4. 达上限或候选耗尽时不再新增邀请；尚有 pending 则等待。全部决策或过期后按第 7.1 节结束寻找；有人接住时不得判定 match_failed。匹配任务重试不重复计数。
5. 匹配失败不调用 AI 生成伪冒真人的回信。

## 11. AI 适配层

1. 业务 service 仅依赖内部 AI 接口，不直接依赖具体模型 SDK。
2. AI 输出先解析到明确 Go struct，不将原始模型 JSON 直接写入核心业务表。
3. prompt 模板和输出 schema 应有版本号，便于追溯和回放。
4. AI 整理结果是草稿，用户确认前不可发起匹配或自动声明用户「演过」。
5. 语义分类结果存储并复用，不在列表查询和每次读取中重复请求模型。
6. 超时、限流或模型失败时返回明确的可重试错误，不用随机占位内容伪装成成功。
7. 模型输入日志默认不记录用户原文；调试采样必须脱敏且由配置显式开启。
8. Bottle 的原文或目标变化时递增 `content_version`。AI 整理接口校验并回传该版本；写回结果时版本不一致返回 `STALE_AI_DRAFT`，不覆盖新内容。
9. 公开表达经历建议使用 `experience_suggestion_jobs` 保存 `processing/completed/failed` 状态；经验切片使用 `slice_drafts` 保存 `generating/ready/failed/published` 状态，前端通过资源接口查询，不直接读取 outbox。
10. 目标经历推测的输入为用户问题、可选目标提示和发送者活动画像；输出只包含待用户确认的必须经历、优先经历、观点偏好和是否使用活动画像。
11. 候选匹配的输入为已确认目标、候选人的开放 Experience，以及双方活动画像；输出为候选内部 ID、匹配分数、命中的 Experience ID 和可展示原因。原始活动内容不进入输出。
12. prompt 和结果中不得要求模型推断姓名、学校、公司、政治倾向、健康、法律或心理状态等无关或敏感画像。用户活动只用于当前经历问题的匹配语义。

### 11.1 实际调用的知乎能力

以仓库 `zhihu/references/` 中的 HTTP 契约为实现依据，只调用下列接口：

| 用途 | 上游接口 | 调用时机 |
| --- | --- | --- |
| 换取用户授权 Token | `POST https://openapi.zhihu.com/access_token` | 用户完成知乎 OAuth 回调后一次 |
| 读取用户本人公开创作 | `GET https://developer.zhihu.com/api/v1/user/contents` | 异步刷新活动画像 |
| 读取用户关注列表 | `GET https://developer.zhihu.com/api/v1/user/followees` | 异步刷新活动画像 |
| 搜索知乎公开讨论 | `GET https://developer.zhihu.com/api/v1/content/zhihu_search` | 目标语义补充、用户主动触发的经历建议、经验切片关联 |
| 查询开放接口额度 | `GET https://developer.zhihu.com/api/v1/quota` | 运维诊断或接近应用预算时，不在每次业务请求前调用 |

当前资料没有给出“关注内容流”的独立 HTTP 路径，因此首版不调用、不猜测该接口。用户画像中的活动信息仅来自其授权后可见的 `contents` 和 `followees`；知乎搜索结果不能按稳定用户主体过滤时，不得根据昵称把搜索结果归到某个用户。

发送者活动画像用于结合问题推测目标经历；接收者活动画像与其本人填写并开放接收的 Experience 共同用于候选排序。活动信息只增强主题和表达语境，不能自动成为 Experience 或单独证明人生经历。

v1 热榜、v2 故事、v5 全网搜索、v6 知乎知识和 v7 直答 Agent 不接入。新增用途必须先更新 `docs/API.md`，不能在业务代码中临时调用；不得将直答内容作为真人回信或匹配失败兜底。

### 11.2 OAuth 与请求鉴权

黑客松项目使用 Authorization Code Flow：

1. 将用户重定向到 `GET https://openapi.zhihu.com/authorize`，Query 固定包含 URL 编码后的 `redirect_uri`、`app_id` 和 `response_type=code`。服务端创建短时、一次性的 OAuth 事务并绑定当前本地会话；可以同时发送随机 `state`。
2. 回调优先读取 `authorization_code`，可兼容读取 `code`；缺少授权码或本地 OAuth 事务已失效时结束授权。若知乎回传 `state`，必须与事务中的值一致；当前资料未承诺一定回传 `state`，未回传时依靠同站会话 Cookie 和一次性事务完成绑定，不自行假定协议字段。
3. 后端向 `POST https://openapi.zhihu.com/access_token` 发送 `application/x-www-form-urlencoded`：`app_id`、`app_key`、固定的 `grant_type=authorization_code`、与登记值完全一致的 `redirect_uri`，以及 `code=<authorization_code>`。
4. Token 交换以响应存在非空 `access_token` 为成功依据，同时保存 `expires_in` 对应的过期时间；不能仅因响应中的业务 `code` 不是 `0` 就判定失败。
5. OAuth Token 只绑定发起授权的当前本地用户。若官方响应没有文档化的稳定知乎主体 ID，不用昵称、头像或关注信息构造 `external_subject`，也不把该授权流程冒充为可靠的知乎账号登录。

代表授权用户调用用户数据接口时，三个 Header 必须同时由 Zhihu adapter 设置：

```http
Authorization: Bearer <ZHIHU_ACCESS_SECRET>
X-OAuth-Token: <该用户的 OAuth access_token>
X-Request-Timestamp: <当前 Unix 秒级时间戳>
```

`App Key` 仅用于服务端换 Token，不能放入请求 Header。公共知乎搜索和额度接口不带 `X-OAuth-Token`，只带 Access Secret 与秒级时间戳。Access Secret、App Key、authorization code 和 OAuth Token 均不得进入 URL、日志、错误响应或前端状态。

OAuth Token 以应用密钥加密后存入 `zhihu_integrations.oauth_token_ciphertext`；首版不保存 authorization code。官方资料未定义 refresh token、scope 和撤销协议，因此不自行实现：Token 过期或上游返回鉴权失败时将集成状态置为 `reauthorization_required`，停止读取该用户数据并提示重新授权，禁止回退成 Access Secret 所属账号的数据。

### 11.3 上游请求参数与响应映射

活动画像刷新每次最多读取必要页，不做全量爬取：

```http
GET /api/v1/user/contents?ContentType=all&SortField=ts&SortOrder=desc&Offset=0&Limit=20
GET /api/v1/user/followees?Offset=0&Limit=20
```

只有画像确实需要更多数据且 `Paging.IsEnd=false` 时，才把 `Paging.NextOffset` 原样解析为 Int64 后请求下一页；首版每类最多 3 页。创作接口的 `Summary` 只是摘要，不当作完整正文。关注数据只提取 `Headline` 等主题线索，不保存头像、性别、粉丝数，也不把关注数量作为匹配信号。

知乎搜索调用格式固定为：

```http
GET /api/v1/content/zhihu_search?Query=<URL 编码的关键词>&Count=10
```

`Count` 最大 10。adapter 只向内部返回 `ContentID`、`ContentType`、`Title`、`ContentText`、`Url`、`EditTime` 和必要的质量信号；`RankingScore`、`AuthorityLevel`、赞同与评论数据只用于内容筛选，不用于给用户排序。

所有数据和搜索接口均同时检查 HTTP 状态与外层 `Code`：`Code=0` 才视为成功。映射规则保持简单：`10001` 为不可重试参数错误，`20001` 为鉴权失败，`30001/30002` 为频率或配额限制，`90001` 与 HTTP 5xx 为短暂上游故障。未知响应结构返回统一的 `ZHIHU_PROTOCOL_ERROR`，不把上游原始响应透传给前端。

额度诊断使用：

```http
GET /api/v1/quota?APIIDs=user_data,zhihu_search
```

只读取 `TotalQuota`、`TotalUsed` 和 `RemainingQuota`；额度查询本身不作为每次调用前的校验步骤。

### 11.4 缓存、配额与失败处理

- 知乎搜索按官方限制，每用户每天最多实际调用 5000 次；应用配置可设置更低预算，不能设置得更高。用户数据接口按上游实际额度和限流响应处理，不假定无限调用。
- 查询先读 `external_api_cache`。缓存键由能力名、规范化查询、分页和影响结果的筛选条件组成；用户数据缓存必须包含本地用户 ID。Token 不进入缓存键和日志。
- 知乎搜索默认缓存 24 小时，用户创作和关注列表默认缓存 6 小时。缓存命中不增加外部调用计数，不得为了刷新页面重复请求知乎接口。
- 发起实际外部请求前，使用 `external_api_usage` 的原子条件更新占用一次应用预算，避免并发突破每日上限；未获得更明确规则前按 Asia/Shanghai 自然日重置。
- 上游 HTTP client 设置统一总超时 10 秒。参数、鉴权、频率和配额错误不重试；Token 交换不自动重试；仅幂等 GET 的网络错误或 HTTP 5xx 最多重试 2 次，使用短指数退避与 jitter。
- 首版直接使用 MySQL 缓存，不引入 Redis。只保存内部接口实际使用的字段，并按过期时间清理。
- 知乎接口失败时优先使用未过期缓存，其次使用上一版画像并标记 `stale`。两者都没有时，目标推测只使用用户问题，匹配只使用确认目标和候选 Experience；经历建议任务标为 failed。该故障不得阻塞瓶子、邀请、连接和真人回信。
- 所有官方路径、Header、参数大小写和响应字段转换集中在 `internal/zhihu` adapter；业务 service 不拼接上游 URL，不依赖官方 JSON struct。

### 11.5 活动画像刷新

- 用户首次完成知乎授权或活动画像过期时写入异步刷新任务；匹配请求不得为每个候选人现场调用知乎接口。
- 只有使用过本应用、身份可可靠关联且已开放接收的用户才会成为候选人。候选画像由其本人使用应用时刷新。
- 刷新成功后将关注主题、内容主题、可能处于的阶段和语义特征写入 `user_activity_profiles`，递增 `profile_version`。不保存关注数量、粉丝数量或用户排名。
- 刷新失败时保留上一版画像并标为 stale；没有上一版时使用问题和 Experience 完成流程。
- 用户关闭全部经历接收后立即退出候选池；已有活动画像只可继续用于其作为发送者时的目标推测，并按正常过期策略刷新或清理，不影响已建立连接。

## 12. 认证、权限和隐私

1. 用户身份只从经验证的 Token 中获取，不信任 body、query 或 header 中的自报 `userId`。
2. 使用平台登录时，本地 `users.external_subject` 保存稳定主体 ID，不把昵称当作唯一身份。
3. 连接详情只向 seeker 和 responder 开放。返回前按该次经历的 `disclosure` 裁剪数据。
   同瓶其他接收者不是该连接参与者，无权读取其消息、经历或身份。瓶子连接列表仅发送者可读，通知关联具体 connection。
4. 知乎活动画像只读取当前 OAuth 用户允许访问的数据。发送者和接收者均不能查看对方的创作列表、关注列表、搜索结果、活动画像或内部匹配分数，只能看到与本次已确认 Experience 相关的匹配原因。
5. 不向对方返回姓名、学校、公司、头像、粉丝数、知乎主页或联系方式。
6. 授权凭据不以明文存入 MySQL，加密密钥从环境或密钥服务取得，不写入仓库。
7. 私人信件、回信、经历正文和活动原文不写入应用日志、错误跟踪 breadcrumb 或指标 label。
8. 删除经历后，已建立连接只保留当时必要快照，不再作为新匹配候选。

## 13. 内容边界

- 普通知识问题引导至搜索、公开问答或 AI，不创建主动匹配瓶子。
- 医疗、法律、心理危机等高风险内容不进入经历匹配，返回 `422` 与对应 `suggestedRoute`。
- 首版将分流放在 AI 整理/确认阶段，不在后续每个接口反复分类。
- 不实现公共求助广场、候选人列表、账号挑选、好友、无限私聊、经历真实性分数、积分或勋章。

## 14. 超时、重试和任务失败

1. HTTP server 必须配置 read header、read、write 和 idle timeout。
2. MySQL 查询使用请求 context 和明确超时，不允许无上限等待。
3. 只重试明确的短暂错误，采用有上限的指数退避与 jitter。
4. 业务冲突、参数错误和权限错误不重试。
5. outbox 任务超过最大尝试次数进入 `failed`，保留 `last_error` 摘要并产生告警；不保存用户原文到错误字段。
6. API 返回成功前，必须已持久化业务变更和对应 outbox。不要仅把任务放进内存 goroutine 后就返回成功。

## 15. 配置与密钥

首版仅保留必要配置，并在 `backend/README.md` 记录：

```text
APP_ENV
HTTP_ADDR
MYSQL_DSN
AUTH_ISSUER
AUTH_AUDIENCE
AI_PROVIDER
AI_MODEL
AI_API_KEY
ZHIHU_OAUTH_APP_ID
ZHIHU_OAUTH_APP_KEY
ZHIHU_OAUTH_REDIRECT_URI
ZHIHU_ACCESS_SECRET
ZHIHU_TOKEN_ENCRYPTION_KEY
ZHIHU_SEARCH_DAILY_BUDGET
ZHIHU_SEARCH_CACHE_TTL
ZHIHU_USER_DATA_CACHE_TTL
LOG_LEVEL
```

- 仓库只提供 `.env.example`，不提交 `.env`、DSN、Token 或 API key。
- 配置在进程启动时解析一次，不在每次请求中重读环境变量。
- 启动时只检查必需配置是否存在，不编写大量自定义配置验证器。
- DSN 必须开启时间解析且使用 UTC；连接池上限通过压测调整，不盲目设为高值。

## 16. Migration 约束

1. 每个 schema 变更都必须有按序号排列的 up/down migration。
2. migration 在部署步骤中单独执行，API 进程启动时不自动修改 schema。
3. 生产环境不使用自动同步 model 建表。
4. 较大表的破坏性变更使用「先扩展、再迁移、后收缩」，不要求新旧代码在长期内同时兼容多套 schema。
5. 种子过来人和演示信件使用独立 seed 命令，不写进生产 migration。

## 17. 观测性

### 17.1 日志

每条 HTTP 请求记录：

- `request_id`
- method 和 route pattern
- status code
- duration
- 经不可逆处理的 user 标识（如确有排障需要）
- 稳定业务错误码

不记录 request/response body、Authorization、Cookie、信件正文、回信或经历正文。

### 17.2 指标

首版指标保持有限：

- API 请求量、错误率和延迟。
- MySQL 连接池使用量和慢查询数。
- outbox 待处理数、最旧任务延迟和失败数。
- 匹配邀请送达数、接住数和放行数。
- 首封回信数、一次追问数和封存数。

不将 user ID、bottle ID、内容分类文本等高基数值作为指标 label。

## 18. 测试约束

### 18.1 单元测试

重点覆盖：

- 状态转换允许与拒绝。
- 目标经历的结构化拆分映射。
- API 错误码与 HTTP status 映射。
- 隐私裁剪，确保不向对方返回隐藏字段。
- worker 任务重试时的幂等性。
- 发送者问题与活动画像到目标经历的结构化结果；候选活动信号只能影响软排序，不能绕过已确认 Experience 硬条件。
- 活动画像缺失时的降级匹配，以及对双方原始活动信息和内部分数的响应裁剪。

不为纯 getter、标准库行为或无分支的机械映射堆叠低价值测试。

### 18.2 MySQL 集成测试

使用真实 MySQL 容器或 CI service，不用 SQLite 代替 MySQL 验证 SQL 行为。必须覆盖：

- migration 可从空库完整执行。
- 两个并发 launch 只有一个获得主动名额。
- 同一邀请重复或并发 accept 只创建一个 connection；同瓶不同接收者并发 accept 分别创建连接。
- 某人接住后其他邀请仍可接住；一段连接回信、追问、封存不影响其他连接，接收者之间不可互读。
- 并发匹配任务不超出投递总上限；暂停后不新增邀请，但已送达邀请仍可处理。
- 达上限且尚有 pending 时不提前判失败；全部决策后，有人接住则 completed，无人接住则 match_failed。
- 拒绝邀请后原瓶子仍在寻找，且拒绝记录不进柜子。
- 首封回信、一次追问和封存的完整事务。
- 关闭或删除经历不改变已有瓶子和连接。
- 邀请过期与用户决策并发时只产生一个最终状态，最后一条邀请结束后正确收尾瓶子。
- processing 任务租约超时后可被重新认领，重复执行不重复创建邀请、连接或通知。
- match_bottle 达到重试上限进入 search_error；业务无候选进入 match_failed，两者均能通过 retry 开启新 round。

### 18.3 API 契约测试

根据 `docs/API.md` 至少覆盖：

1. 新建多个独立草稿。
2. 抛出一个瓶子并拒绝第二个并行主动寻找。
3. 接收邀请 → 接住 → 回信 → 柜子可见。
4. 接收邀请 → 这次不聊/没演过 → 原瓶继续匹配且柜子不可见。
5. 经历新建、编辑和关闭接收。
6. 同瓶两位接收者分别回信，发送者分别使用各自的一次追问并封存；柜子按瓶聚合，未读按连接独立。
7. 匹配失败调整条件后重试，历史邀请保留且不重复投递给同一用户。
8. 通知分页、幂等已读，以及经验切片生成、查询、修改和发布。

## 19. 本地开发与 CI

引入后端代码时，`backend/README.md` 必须记录可复现的以下命令：

```sh
# 启动 MySQL
docker compose up -d mysql

# 运行 migration
<migration command>

# 启动 API
go run ./cmd/api

# 启动 worker
go run ./cmd/worker

# 单元测试
go test ./...

# 静态检查
go vet ./...
```

具体 migration 工具、本地编排文件和命令在首次 scaffold 时选定后写实，文档中不预假装尚未存在的命令可用。

CI 最少执行：

1. `gofmt` 差异检查。
2. `go vet ./...`。
3. `go test ./...`。
4. 在真实 MySQL service 上执行 migration 和集成测试。
5. 构建 `api` 和 `worker` 两个二进制文件。

## 20. 性能基线

首版不做过早优化，只遵守：

- 列表接口必须分页，禁止无限制返回所有瓶子、消息或通知。
- 柜子列表使用摘要查询，不同时返回所有信件和消息全文。
- 禁止在列表循环中为每一行发起额外 SQL，避免 N+1。
- 主页 `/home` 使用少量聚合 SQL 返回计数和状态，不加入不必要的长时间缓存。
- 只在真实压测或慢查询显示有需要后引入 Redis、搜索引擎或独立消息队列。

## 21. 不得做的实现偏离

- 不得用 AI 生成内容冒充真人回信。
- 不得将「查看瓶子柜」实现为「接收新瓶子」。
- 不得因接收者放行而将原瓶子直接关闭或判定匹配失败。
- 不得将拒绝的邀请放入接收者瓶子柜。
- 不得在未经用户确认时自动创建「我走过的经历」。
- 不得将经历记录附属在某个瓶子上，或随瓶子关闭而删除。
- 不得向用户声称已从全知乎或实时在线用户中找到「最合适」的人。
- 不得引入候选人列表、公共求助广场、无限私聊、好友关系或联系方式交换。

## 22. 实现顺序

1. 建立 Go 工程、MySQL migration、配置、健康检查和通用 JSON 错误。
2. 实现长期经历 CRUD、瓶子草稿、抛出与每用户最多 10 个主动名额。
3. 实现 worker outbox、匹配邀请、接住/放行。
4. 实现首封回信、瓶子柜和通知。
5. 接入 AI 整理、目标经历拆分与内容分流。
6. 实现一次追问、封存、反馈和经验切片。
7. 按第 11 节接入知乎 OAuth、用户创作、关注列表和知乎搜索，生成活动画像并加入目标推测与候选排序；其余知乎内容能力不接入。
