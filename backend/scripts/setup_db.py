#!/usr/bin/env python3
"""Generate local database credentials without overwriting an existing .env."""
import os
from pathlib import Path
import secrets


def main():
    target = Path(__file__).resolve().parents[1] / ".env"
    password = secrets.token_hex(24)
    root_password = secrets.token_hex(24)
    content = (
        "# Local only; do not commit or send this file.\n"
        "MYSQL_PORT=3307\n"
        f"MYSQL_PASSWORD={password}\n"
        f"MYSQL_ROOT_PASSWORD={root_password}\n"
        f"MYSQL_DSN=drift_app:{password}@tcp(127.0.0.1:3307)/drift_bottle"
        "?charset=utf8mb4&parseTime=true&loc=UTC&time_zone=%27%2B00%3A00%27"
        "&timeout=5s&readTimeout=10s&writeTimeout=10s\n"
    )
    try:
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        print("已有 backend/.env，保留原配置。")
        return
    with os.fdopen(fd, "w") as output:
        output.write(content)
    print("已生成 backend/.env（随机密码，不输出凭据）。")


if __name__ == "__main__":
    main()
