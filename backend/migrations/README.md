# 数据库迁移

使用 golang-migrate v4.18.3，MySQL 8.4.11 / InnoDB / utf8mb4 / UTC。

在 backend 目录执行 `docker compose run --rm migrate` 应用全部未执行迁移；重复执行不会重复建表。`000001_initial.up.sql` 创建 22 张业务表，`000002_allow_ten_active_bottles.up.sql` 将搜索名额从每人一个改为每人最多十个（数量上限由 Go 事务执行）。配对 down 文件用于明确回滚。

迁移独立于 API 启动，不添加生产演示数据。后续新增成对编号文件，不修改已发布版本。完整启动、字段和事务约定见 [数据库交接](../database/README.md)。
