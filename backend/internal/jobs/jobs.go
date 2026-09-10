// Package jobs 管理 MySQL outbox 任务认领、执行和恢复。
// 短事务 SKIP LOCKED 认领 → 提交 → 执行业务 → 写成功或失败状态。
// processing 租约 5 分钟；最多尝试 5 次，退避和 jitter 有上限。
// 匹配、活动画像、建议与切片等任务按业务键幂等；限流不忙循环重试。
// 启动及每分钟扫描：过期邀请、失效租约、缺失匹配任务。
// match_bottle 最终失败按 round 条件置 search_error，释放名额并通知。
// API 返回成功前已落库业务变化和 outbox，不仅用内存 goroutine。
package jobs
