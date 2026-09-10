// OAuth：authorize → 回调 authorization_code → access_token 表单交换。
// App Key、Access Secret 与用户 Token 职责分离，不出现在前端响应或日志。
// expires_in 管理有效期；过期停止读取并重新授权，不猜测刷新或撤销接口。
// 待协议确认：稳定主体 ID、state 回传和安全的请求绑定。
// 若无 state/PKCE 等可信绑定机制，仅 Cookie 和待处理事务不能证明回调码
// 属于本次授权；不能直接沿用文档中的 Cookie 兜底自动绑定账号。
// Token 存储生命周期与持久化方案应按提供的 OAuth 文档确定后实施。
package zhihu
