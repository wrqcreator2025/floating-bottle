// Package zhihu 封装仓库 zhihu/references 中的上游 HTTP 协议。
// contents/followees：Bearer Access Secret + 用户 X-OAuth-Token + 秒级时间戳。
// Content-Type: application/json；Query 大小写严格遵守上游文档。
// contents：ContentType=all、SortField=ts、SortOrder=desc、Offset=0、Limit=20。
// followees：Offset=0、Limit=20；按 Paging 按需续页，默认上限见后端约束。
// zhihu_search：Query、Count<=10，无作者过滤与可用分页；摘要不当正文。
// quota：APIIDs=user_data,zhihu_search；额度属于 Access Secret 账号，
// 多个应用用户共用凭据时还需共享凭据预算，不能给每人复制上游总额度。
// 搜索和 quota 不带用户 OAuth Token；无关注内容流 HTTP 契约则不调用。
// 缓存按授权用户隔离；错误区分 HTTP 状态与 Code，禁止回退读取开发者本人。
// 网络请求统一 context、超时和有界重试；不在数据库事务内执行。
// 本骨架不发请求、不读取凭证，不安装知乎 CLI。
package zhihu
