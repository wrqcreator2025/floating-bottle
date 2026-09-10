// Package domain 保存业务对象、状态常量与错误语义。
// Bottle：发送者问题、确认目标、content_version、search_round、寻找状态。
// Experience：长期经历、本人确认、receive_open、disclosure，与瓶子独立。
// Invitation：一个瓶子对一位接收者的邀请及到期时间。
// Connection：一只瓶子联系的一对用户，独立回信、反馈、未读与封存。
// ChatInvitation / ChatSession：收到回信后由发信者邀请，对方接受才可聊天。
// 匿名聊天需求晚于文档的“一次追问”约束，详见 backend/README.md。
// Notification、SliceDraft、ActivityProfile 与业务任务保存各自状态。
// 未来使用明确 struct；当前不预写字段定义或通用 CRUD 抽象。
package domain
