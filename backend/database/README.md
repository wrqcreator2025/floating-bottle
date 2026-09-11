# 数据库交接

数据库部分已实现；HTTP API、Go repository 和 worker 仍由后端继续实现。这里使用真实 MySQL，不需要同学在系统里安装 MySQL，也不要求安装 Go 才能建库。

## 本机启动

需要 Docker Engine / Docker Desktop（带 Compose）和 Python 3。Windows 请先启动 Docker Desktop，以下命令在 PowerShell 也可执行（如有需要将 python3 改为 python）。在项目 `backend/` 目录执行：

```sh
python3 scripts/setup_db.py
docker compose up -d --wait mysql
docker compose run --rm migrate
python3 -m unittest discover -s tests -p 'test_database.py' -v
```

第一次下载镜像需要联网。初始化脚本生成随机密码，保存到 `backend/.env`，重复运行不会覆盖；不要发送或提交该文件。Compose 自动读取它，但 Go 不会自动读取 `.env`，后端配置模块需要加载或由启动环境注入 `MYSQL_DSN`。

连接参数：

| 项目 | 值 |
| --- | --- |
| 主机 | `127.0.0.1` |
| 端口 | `3307`，避开本机已有的 3306 |
| 数据库 | `drift_bottle` |
| 用户 | `drift_app` |
| 密码 | 本机 `backend/.env` 中的 `MYSQL_PASSWORD` |
| Go database/sql DSN | 同文件中的 `MYSQL_DSN` |
| 同 Compose 网络内的后端容器 | 把 DSN 主机端口改成 `mysql:3306` |

端口占用时同时修改 `.env` 中的 `MYSQL_PORT` 和 `MYSQL_DSN` 的端口。每个同学自行生成凭据和本地数据库，不需要共享你的密码。当前仅监听回环地址，另一台电脑不能直接连接；需要共享数据库时应另外部署并通过受控网络接入。

```sh
# 查看状态 / 日志
docker compose ps
docker compose logs --tail 50 mysql
# 再次执行迁移是安全的，无新版本时返回 no change
docker compose run --rm migrate
# 停止，数据卷仍然保留
docker compose down
# 查看迁移版本
docker compose run --rm migrate version
```

不要用 `down -v` 日常关库，该选项会删除数据卷。已有数据卷时修改 `.env` 密码不会修改数据库账号密码，要保留原凭据或由管理员执行密码修改。这是 [MySQL 容器初始化的行为](https://dev.mysql.com/doc/refman/8.4/en/docker-mysql-more-topics.html)。本地账号拥有该开发库的建表权限，正式部署需分开迁移账号和业务账号。

## 表与约定

首版 22 张业务表，版本由 golang-migrate 的 `schema_migrations` 单独记录：

| 范围 | 表 |
| --- | --- |
| 用户与经历 | users、experiences |
| 瓶子与匹配 | bottles、active_search_slots、match_invitations |
| 回信与匿名聊天 | connections、messages、chat_invitations、chat_sessions、connection_feedback |
| 通知与切片 | notifications、slice_drafts |
| 审核、举报、屏蔽 | moderation_reviews、abuse_reports、user_blocks |
| 知乎与后台任务 | zhihu_integrations、user_activity_profiles、experience_suggestion_jobs、outbox_jobs |
| 缓存与配额 | external_api_cache、external_api_usage、external_api_account_usage |

- 业务 ID 统一为 `CHAR(26)` 裸 ULID，ASCII 二进制比较。Go 生成 ULID，API 若使用 `btl_`、`con_` 等前缀，由 repository/API 边界转换，不能直接把带前缀的字符串写入列。
- InnoDB、utf8mb4、`utf8mb4_0900_ai_ci`；身份标识和幂等键按大小写精确匹配。时间使用 UTC `DATETIME(6)`；`updated_at` 统一由 MySQL 更新，应用不额外赋值。
- `active_search_slots` 记录每个正在搜索的瓶子，复合主键允许一人持有多个名额，`bottle_id` 唯一且复合外键防止占用别人的瓶子。Go service 在锁定 `users` 行后计数，限制每人最多 10 个；数据库结构本身不使用触发器实现数量上限。同一个瓶子允许多个独立 connection；邀请按瓶子和接收者去重，retry 不重置累计投递人数。
- 删除经历会将邀请的 `matched_experience_id` 置空，并保留邀请时的披露快照。其他核心外键默认限制删除，避免删除用户或瓶子时悄悄清空私人交流。
- 聊天消息放 `messages(kind='chat')`，首封回信为 `kind='reply'`，共用连接内递增序号。聊天参与者从 connection 获取，无需另存身份。每连接一份邀请和一份会话；拒绝后的再邀请、关闭后的重开暂不提供，若契约扩展，再增加迁移。
- `messages.delivery_status` 默认 `pending_moderation`。审核记录以资源类型、ID、内容版本唯一绑定，并保存最终文本 SHA-256。未通过、失败、复核中的内容不得送达。
- `external_api_account_usage.account_key` 使用部署提供的稳定账号标识的哈希，不保存 Secret。共享账号的总额度和用户调用量要在同一事务内预占/计数，不能给每位用户重复分配平台总额度。`usage_date` 按平台配额重置时区计算，不直接用数据库 UTC 日期代替。
- `external_api_cache.request_hash` 必须包含当前授权用户/账号的隔离标识、能力和规范化参数；不能只哈希 URL 导致跨用户缓存命中。
- `oauth_token_ciphertext` 仅存应用加密后的密文；schema 不代表 OAuth 请求绑定问题已解决。审核和任务错误列只保存脱敏错误码。

## 后端必须实现的事务与权限

外键和唯一索引负责数据关系，不能代替 service 的用户权限、状态检查和内容审核。

1. 抛出瓶子：先锁用户行以串行化该用户的名额变更，再锁瓶子行，验证归属、目标确认、最终内容版本审核通过；统计名额少于 10 后，同事务占用名额、更新瓶子状态、插入 outbox。
2. 接住邀请：条件更新 pending 且未过期的邀请，同事务建立对应 connection 和通知。不能取消其他接收者的连接。
3. 发消息：锁 connection 行，验证参与者和屏蔽关系；聊天要求已接受邀请且 session 为 active。分配序号，保存待审核消息及 outbox；审核通过且版本/hash 仍一致后才送达和通知。查询只向对方返回已送达消息，原作者可见自己的待审核/被拒原稿。
4. 接受聊天：先验证发起者是已收到回信的 seeker，只有 responder 可接受；同事务更新邀请并建 session。关闭/屏蔽后不能继续送达排队消息。
5. worker：短事务 `SELECT ... FOR UPDATE SKIP LOCKED` 认领任务，设置 processing/locked_at/locked_by/attempts；提交后再调用外部服务。5 分钟租约恢复和按 event_key 幂等由 worker 实现。
6. 复核、举报和切片：验证资源归属；举报 message 必须属于所选 connection，切片 author 必须是 responder 且已主动同意。多态资源引用（审核、通知）由 service 验证。

状态列保留 VARCHAR，状态机在 Go 维护；不能因为数据库接受一条 INSERT，就认为聊天授权或审核已经通过。旧 API 中“一次追问”的说明尚待后端更新，schema 已支持最新匿名聊天需求。

## 迁移与验证

迁移单独执行，API 启动不建表。新增结构用 `000002_描述.up.sql` 和 `.down.sql`，不要修改已经在团队环境执行过的 migration。迁移中不放演示用户或假回信。

测试使用真实 MySQL，验证多人接住、单主动名额、外键归属、邀请/消息/通知去重、经历删除快照、审核版本和默认不送达、聊天关联。每例在事务中插入 `TEST_DB_` 临时数据，正常及预期错误退出时均回滚；只在开发库执行，不代表 service 状态机已测。

MySQL DDL 不能整体事务回滚；迁移失败会留下 dirty 标记。先查错误和实际表结构，修复后再决定回滚或修正版本，不能盲目执行 `force`。`down 1` 会删除本版所有业务表，仅用于空测试库或备份后的明确回滚。
