// Package mysql 使用 database/sql、显式 SQL 和 MySQL driver。
// 按具体用例提供查询与条件更新；不引入通用 Repository 或反射 ORM。
// Service 定义事务边界，本层执行 SQL、行映射和唯一键错误转换。
// MySQL 8.x、InnoDB、utf8mb4、UTC；migration 另行执行。
// 唯一约束包括：active_search_slots(user_id)、
// match_invitations(bottle_id,recipient_id)、connections(invitation_id)、
// connections(bottle_id,responder_id)、messages(connection_id,sequence_no)。
// 不得单独唯一约束 connections.bottle_id。
// 缓存、调用计数与 outbox 同样放 MySQL；当前无 SQL 或连接实现。
package mysql
