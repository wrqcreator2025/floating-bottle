// 瓶子用例：创建、编辑、详情、launch、pause、resume、retry、寻找状态。
// 草稿可以重复创建；单用户只占一个主动寻找名额。
// launch 事务：取得名额 → 条件更新状态 → 写 match_bottle outbox。
// retry 更新 search_round，保留历史邀请且排除历史接收者。
// 首次接住不结束其他投递；技术失败 search_error 与无匹配 match_failed 分开。
// 参数格式仅 HTTP 层检查；此处检查归属与业务状态。
package service
