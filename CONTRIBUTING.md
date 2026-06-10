# 为 Omnara 做贡献

感谢你有兴趣参与贡献！

## 前置条件

- **Docker**（自动化安装所必需）
- **Python 3.11+**
- **Git**

注意：PostgreSQL 运行在 Docker 中，无需在本地安装数据库！

## 快速开始（自动化）

最快的上手方式：

1. **Fork 并克隆仓库**
   ```bash
   git clone https://github.com/omnara-ai/omnara.git
   cd omnara
   ```

2. **复制环境配置**
   ```bash
   cp .env.example .env
   ```

3. **生成 JWT 密钥**
   ```bash
   python infrastructure/scripts/generate_jwt_keys.py
   ```

4. **一条命令启动所有服务**
   ```bash
   ./dev-start.sh
   ```
   该命令会自动：
   - 在 Docker 中启动 PostgreSQL
   - 运行数据库迁移
   - 启动 Backend API（端口 8000）
   - 启动统一服务器（端口 8080）

5. **开发结束后**
   ```bash
   ./dev-stop.sh
   ```

### 重置数据库
如果你需要一个全新的数据库：
```bash
./dev-start.sh --reset-db
```

## 替代方案：手动安装

如果你希望手动控制各个步骤：

1. 搭建开发环境：
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   make dev-install
   make pre-commit-install
   ```

2. 安装 PostgreSQL，并在 `.env` 中配置 `DATABASE_URL`

3. 生成 JWT 密钥：`python infrastructure/scripts/generate_jwt_keys.py`

4. 运行迁移：`cd src/shared && alembic upgrade head`

5. 手动启动各服务：
   ```bash
   # 设置 Python 路径（导入模块所必需）
   export PYTHONPATH="$(pwd)/src"

   # 终端 1：统一服务器
   python -m servers.app

   # 终端 2：Backend API（在项目根目录运行，而非 backend/ 目录）
   uvicorn backend.main:app --port 8000
   ```

## 开发流程

1. 创建分支：`feature/`、`bugfix/` 或 `docs/`
2. 进行你的修改
3. 运行检查：`make lint` 和 `make test`
4. 提交 pull request

## 代码风格

- Python 3.10+
- 必须使用类型注解
- 遵循现有的代码模式
- 为新功能编写测试

## 数据库变更

修改模型时：

1. 在 `src/shared/database/models.py` 中编辑模型
2. 生成迁移：`cd src/shared && alembic revision --autogenerate -m "description"`
3. 提交前测试迁移

## 提交信息

使用约定式提交（conventional commits）：

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档
- `refactor:` 代码重构
- `test:` 测试

示例：`feat: add API key rotation endpoint`

## 可用命令

```bash
make lint          # 运行代码检查
make format        # 自动格式化代码
make test          # 运行所有测试
make test-unit     # 仅运行单元测试
make test-integration  # 集成测试（需要 Docker）
make typecheck     # 类型检查
```

## 有问题？

在 GitHub 上提一个 issue 吧！
