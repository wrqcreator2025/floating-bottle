// Package httpapi 使用 Gin 承载 /api/v1。
// handler：解析请求和最小校验 → service → data/error 响应。
// 统一处理请求 ID、认证、日志、panic recovery、必要限流与 CORS。
// DTO 独立于数据库行；错误只映射一次；不在 handler 写 SQL。
// 路由清单见 routes.md；这是待注册清单，当前没有运行中的接口。
// 前端只接收业务状态、分页游标和 interaction，不接收 Three.js 参数。
package httpapi
