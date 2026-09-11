# 漂流瓶后端

数据库已有 Docker 配置、22 张业务表的编号迁移和真实 MySQL 集成测试。无需单独安装 MySQL，启动与连接步骤见 [数据库交接](database/README.md)。Go API 已完成第一批可运行能力：健康检查、开发身份、经历 CRUD、瓶子草稿、编辑、详情与抛出事务。

## 启动 API

先按数据库交接说明启动 MySQL 并执行迁移，再安装 Go 1.22 或更高版本。在 `backend/` 目录执行：

```sh
go mod tidy
go test ./...
go run ./cmd/api
```

旧版 `backend/.env` 若没有 API 配置，请补充：

```dotenv
APP_ENV=development
HTTP_ADDR=:8080
DEMO_AUTH_ENABLED=true
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

本地接口使用 `Authorization: Bearer demo.alice`。换成 `demo.bob` 即可模拟另一位用户。该模式只用于本地联调，配置层禁止在 `APP_ENV=production` 时开启。

已实现路由：

- `GET /healthz`、`GET /readyz`
- `GET/POST /api/v1/experiences`
- `PATCH/DELETE /api/v1/experiences/{experienceId}`
- `POST /api/v1/bottles`
- `GET/PATCH /api/v1/bottles/{bottleId}`
- `POST /api/v1/bottles/{bottleId}/launch`

## 已确定的首版技术选型

采用 Gin 处理 HTTP API，`database/sql` 访问 MySQL，`log/slog` 记录日志。首版直接编写 SQL；暂不引入 ORM、sqlc、Redis、独立消息队列或微服务。

首版基础设施只包含 Gin 应用和 MySQL。产品中必须异步执行的匹配、审核等少量任务使用 MySQL 任务表持久化，并由同仓库的 Go worker 消费；这里的任务表不是独立消息队列，也不增加 Redis、RabbitMQ、Kafka 或 NATS。只有在实际流量、任务吞吐或可靠性要求证明有必要时，才重新评估消息队列。

代码保持 `handler → service → repository → MySQL` 分层：Gin handler 只处理 HTTP 输入输出，业务规则放在 service，SQL 放在 repository。这样以后增加缓存或消息队列时不需要重写业务层。

数据库锁定 MySQL 8.4.11 和 golang-migrate v4.18.3。Go 同学初始化模块时再锁定 Go 与 MySQL driver，生成 go.mod/go.sum。

## 文件入口

| 路径 | 阅读内容 |
| --- | --- |
| cmd/api/main.go | Gin HTTP 进程装配和优雅退出 |
| cmd/worker/main.go | 异步进程装配和退出顺序 |
| internal/httpapi/routes.go、routes.md | 已实现路由与后续业务路由清单 |
| internal/service/ | 瓶子、接收、回信、聊天、经历、查询和切片用例 |
| internal/domain/models.go | 业务对象与状态职责 |
| internal/repository/mysql/repository.go | SQL、唯一约束和事务执行 |
| internal/matching/matching.go | 筛选、排序和有限投递 |
| internal/ai/ai.go | 模型任务与输入输出边界 |
| internal/zhihu/ | 用户数据、搜索、额度和 OAuth |
| internal/auth/auth.go | 本应用身份与资源权限 |
| internal/jobs/jobs.go | outbox 认领、重试和恢复 |
| internal/config/config.go | 配置加载与密钥来源 |
| database/README.md、compose.yaml | 数据库启动、连接、字段与事务交接 |
| migrations/、tests/test_database.py | 数据迁移与真实数据库验证 |

调用关系：HTTP → service → repository；worker → jobs → service/matching。AI 与知乎适配器在事务外调用。校验按 HTTP 格式、service 归属与状态、数据库一致性分工，不逐层重复检查。

## 文档衔接

依据 ../docs/API.md 与 ../docs/BACKEND-CONSTRAINTS.md；以下差异已在骨架注释标出，具体实现前需要同步契约：

- 用户已确认匿名聊天：发信者收到回信后邀请，对方接受才开启双人聊天。旧文档仍限制一次追问；chat.go 按最新需求预留，不把旧限制施加到已接受的聊天上。
- 3D 柜子固定装满，任意装饰瓶统一展开 cabinet 记录；实际记录依旧来自数据库，不生成虚假记录填满柜子。
- API.md 的“暂无 OAuth”和关注内容流描述落后于后端约束。使用仓库实际提供的 contents/followees/search 协议，授权入口 URL 与状态字段需要同步后再实现。
- OAuth 缺少 state 回传或其他可靠请求绑定时，仅凭会话 Cookie 与一次性事务不能防止授权码替换；应先确认平台支持的绑定机制。稳定知乎主体与 Token 持久化生命周期同样不能凭空补齐。
- 上游额度查询针对 Access Secret 账号；应用多人共享 Secret 时需要共享总预算，不能将上游额度乘以本地用户数。

本次保留这些差异的明确位置，不改写整份历史 PRD。尚未实现的 worker、匹配、回信、匿名聊天、AI 与知乎模块仍保留注释边界，不能视为可用功能。
