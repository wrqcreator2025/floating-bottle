# 漂流瓶

知乎黑客松 2026｜校园新锐季参赛项目，探索按真实经历连接人与人。

## 项目文档

- `PRODUCT_CONSTRAINTS.md`：后续设计和开发前必读的长期硬性要求。
- `docs/PRD.md`：按用户 31 节原稿整理的完整产品范围。
- `docs/API.md`：根据 PRD 和已确认前端流程整理的前后端接口契约。
- `docs/BACKEND-CONSTRAINTS.md`：Gin + MySQL 后端的技术选型、分层、数据、状态、事务、异步任务与测试约束。
- `docs/VISUAL-EXPERIMENT-01.md`：本次可修改的视觉实验推导。

## 查看网页与手机原型

后端注释骨架位于 `backend/`，首版技术栈已确定为 Gin + MySQL。暂不引入 Redis、独立消息队列和微服务；必须异步执行的少量任务使用 MySQL 任务表持久化，不增加新的基础设施。模块职责及文档待同步事项见 [backend/README.md](backend/README.md)。数据库已补齐 Docker 启动、SQL 迁移与测试，见 [数据库接入说明](backend/database/README.md)；HTTP 业务服务仍待实现。

当前三维海岛前端位于 `frontend/`，视觉基准为 `海岛漂流瓶-设计展示-03.png`。它使用 Three.js 实现海面、小岛、房屋、漂流瓶、瓶子柜和经历日记，提供桌面与手机交互。安装、运行、构建和测试命令见 `frontend/README.md`。

最新的 QQ 小程序式海域交互原型为 `landing-miniapp.html`。它包含可点击的他人瓶子、小型装饰瓶、二维分页瓶子柜、投放动画、回信红点与再次访问自动展示回信，以及按标签生成经历描述的本地演示。

直接使用浏览器打开 `landing-miniapp.html`，无需安装依赖。页面状态保存在当前浏览器的 `localStorage` 中，不会联网或真实发送内容。

直接使用浏览器打开 `landing-experiment.html`，无需安装依赖。此页面内置样式、SVG 以外的 CSS 图形及本地交互，无外部字体或图片请求。电脑使用双列布局，窄屏切换手机布局。

也可在此目录运行：

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

浏览器访问 `http://localhost:8000/landing-experiment.html`。远程开发环境需要转发 8000 端口。

`index.html` 为未获接受的早期设计，仅保留对比。本次尝试未接入 AI、账户、数据存储、真实过来人或消息发送，不代表 PRD 功能已实现。

## 验证

前端构建、数据测试和浏览器测试见 `frontend/README.md`。数据库使用真实 MySQL 集成测试，启动和验证命令见 [数据库交接](backend/database/README.md)。
