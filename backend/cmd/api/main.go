// API 进程入口（注释骨架，尚无 main 函数）。
// 启动顺序：加载配置 → 创建 slog 日志 → 建立 MySQL 连接池 →
// 装配 repository、AI/知乎适配器与 service → 注册 Gin 路由 → 监听。
// 所有依赖显式传入；不使用全局数据库或隐式 init 注册。
// 配置服务器超时；收到退出信号后停止接收请求并关闭连接池。
// migration 由部署步骤单独执行，启动时不自动建表。
package main
