// Package config 负责启动时一次性读取配置。
// 配置项见 docs/BACKEND-CONSTRAINTS.md 第 15 节。
// 只检查必要项、类型与有效范围；知乎未启用时允许核心业务运行。
// 密钥通过部署 Secret 注入，不写入代码、日志或示例真实值。
// Go 版本和依赖精确版本在正式初始化 go.mod 时锁定。
package config
