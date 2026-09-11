# 数据库迁移

使用 golang-migrate v4.18.3，MySQL 8.4.11 / InnoDB / utf8mb4 / UTC。

在 backend 目录执行 `docker compose run --rm migrate` 应用全部未执行迁移；重复执行不会重复建表。`000001_initial.up.sql` 创建 22 张业务表，配对 down 文件按外键依赖逆序删除。

迁移独立于 API 启动，不添加生产演示数据。后续新增成对编号文件，不修改已发布版本。完整启动、字段和事务约定见 [数据库交接](../database/README.md)。
