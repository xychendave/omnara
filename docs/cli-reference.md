# CLI 参考

Omnara CLI 提供多个命令，用于运行和管理带有仪表盘集成的 AI 编码智能体。

## 安装

```bash
pip install omnara
```

## 快速开始

```bash
# 启动带有完整集成的 Claude Code
omnara

# 使用其他智能体启动
omnara --agent codex
omnara --agent amp
```

## 命令

### 默认命令（交互式会话）

启动具有完整终端集成和仪表盘同步功能的 AI 编码智能体。

```bash
omnara [OPTIONS]
```

**常用选项：**
- `--agent <name>` - 选择智能体：`claude`（默认）、`codex` 或 `amp`
- `--api-key <key>` - 用于身份验证的 API key（或设置 `OMNARA_API_KEY`）
- `--name <display_name>` - 仪表盘中的自定义显示名称
- `--no-relay` - 禁用 WebSocket 流式传输（仅本地会话）
- `--agent-instance-id <id>` - 恢复已有会话

**示例：**
```bash
# 启动 Claude Code（默认）
omnara

# 以自定义名称启动 Codex
omnara --agent codex --name "Backend Refactor"

# 不带仪表盘流式传输的仅本地会话
omnara --no-relay
```

### `omnara headless`

以后台模式运行 Claude Code，无需终端 UI。非常适合仅通过仪表盘交互或自动化场景。

```bash
omnara headless [OPTIONS]
```

**选项：**
- `--prompt <text>` - 要发送的初始提示词（默认："You are starting a coding session"）
- `--permission-mode <mode>` - 权限处理方式：
  - `acceptEdits` - 自动接受所有编辑
  - `bypassPermissions` - 绕过所有权限检查
  - `plan` - 计划模式
  - `default` - 正常提示
- `--allowed-tools <list>` - 逗号分隔的工具白名单（例如 `Read,Write,Bash`）
- `--disallowed-tools <list>` - 逗号分隔的工具黑名单
- `--cwd <path>` - 工作目录（默认为当前目录）

**示例：**
```bash
# 基本的后台会话
omnara headless

# 自动接受编辑并指定工具
omnara headless --permission-mode acceptEdits --allowed-tools Read,Write,Bash

# 以自定义提示词启动
omnara headless --prompt "Review and refactor the auth module" --cwd /path/to/project
```

### `omnara serve`

启动一个 webhook 服务器，允许从仪表盘或其他集成远程触发 Claude Code 会话。

```bash
omnara serve [OPTIONS]
```

**选项：**
- `--no-tunnel` - 在本地运行，不使用 Cloudflare 隧道（默认：启用隧道）
- `--port <number>` - 服务器端口（默认：6662）
- 权限标志会透传给 Claude Code 实例

**示例：**
```bash
# 使用 Cloudflare 隧道启动（公开 URL）
omnara serve

# 仅本地的 webhook 服务器
omnara serve --no-tunnel --port 8080

# 带权限设置
omnara serve --permission-mode acceptEdits
```

**用法：**
1. 运行 `omnara serve` 启动 webhook 服务器
2. 复制显示的 webhook URL 和 API key
3. 在你的 Omnara 仪表盘中通过 Settings → Integrations 进行配置
4. 从手机或网页仪表盘远程触发 Claude Code 会话

### `omnara mcp`

运行 MCP（Model Context Protocol）stdio 服务器，以便与 MCP 兼容的客户端集成。

```bash
omnara mcp [OPTIONS]
```

**选项：**
- `--api-key <key>` - 用于身份验证的 API key（必填）
- `--permission-tool` - 启用 Claude Code 权限提示工具
- `--git-diff` - 为消息启用自动 git diff 捕获
- `--agent-instance-id <id>` - 使用已有的智能体实例
- `--disable-tools` - 禁用除权限工具之外的所有工具

**示例：**
```bash
# 基本的 MCP 服务器
omnara mcp --api-key YOUR_KEY

# 启用 git diff 跟踪和权限提示
omnara mcp --api-key YOUR_KEY --git-diff --permission-tool
```

**MCP 客户端配置：**

对于 Claude Desktop（`claude_desktop_config.json`）：
```json
{
  "mcpServers": {
    "omnara": {
      "command": "omnara",
      "args": ["mcp", "--api-key", "YOUR_API_KEY"]
    }
  }
}
```

对于 pipx 安装方式：
```json
{
  "mcpServers": {
    "omnara": {
      "command": "pipx",
      "args": ["run", "--no-cache", "omnara", "mcp", "--api-key", "YOUR_API_KEY"]
    }
  }
}
```

## 身份验证

### 首次设置

```bash
omnara --auth
```

打开浏览器进行身份验证。API key 会自动保存到 `~/.omnara/credentials.json`。

### 重新验证

```bash
omnara --reauth
```

即使凭据已存在，也强制重新进行身份验证。

### 环境变量

```bash
export OMNARA_API_KEY="your-api-key-here"
omnara
```

### 手动指定 API key

```bash
omnara --api-key YOUR_API_KEY
```

## 智能体配置

### 设置默认智能体

```bash
# 设置默认值并退出
omnara --set-default codex

# 设置默认值并立即启动
omnara --agent amp --set-default
```

默认值存储在 `~/.omnara/config.json` 中，并用于之后的所有会话。

### 可用智能体

- **claude**（默认）- Anthropic 的 Claude Code
- **codex** - Codex CLI
- **amp** - Amp CLI

## 环境变量

| 变量 | 描述 |
|----------|-------------|
| `OMNARA_API_KEY` | 用于身份验证的 API key |
| `OMNARA_API_URL` | API 服务器 URL（默认：`https://agent.omnara.com`） |
| `OMNARA_AGENT_INSTANCE_ID` | 要恢复的已有会话 ID |
| `OMNARA_AGENT_DISPLAY_NAME` | 仪表盘中的显示名称 |
| `OMNARA_RELAY_DISABLED` | 设置为 `1` 以禁用 WebSocket 中继 |
| `OMNARA_CODEX_PATH` | Codex 二进制文件的路径（仅适用于 Codex 智能体） |

## 配置文件

### `~/.omnara/credentials.json`

存储身份验证凭据（API key）。

```json
{
  "write_key": "omr_xxxxxxxxxxxxxxxxxxxx"
}
```

### `~/.omnara/config.json`

存储用户偏好（非敏感设置）。

```json
{
  "default_agent": "claude"
}
```

## 全局选项

以下选项适用于所有命令：

- `--version` - 显示版本信息
- `--auth` - 进行身份验证或重新验证
- `--reauth` - 强制重新进行身份验证
- `--base-url <url>` - Omnara API 服务器 URL
- `--auth-url <url>` - 身份验证前端 URL

## 版本信息

```bash
omnara --version
```

## 示例

### 开发工作流

```bash
# 初始设置
omnara --auth

# 将 Claude 设为默认
omnara --set-default claude

# 启动一个编码会话
omnara --name "Feature Development"
```

### 远程触发

```bash
# 终端 1：启动 webhook 服务器
omnara serve

# 终端 2：通过仪表盘从另一台机器触发
# 使用终端 1 中显示的 webhook URL
```

### 后台自动化

```bash
# 运行自动化代码审查
omnara headless \
  --prompt "Review all files in src/ for security issues" \
  --permission-mode acceptEdits \
  --allowed-tools Read,Grep \
  --cwd /path/to/project
```

### MCP 集成

```bash
# 启动具有完整功能的 MCP 服务器
omnara mcp \
  --api-key YOUR_KEY \
  --git-diff \
  --permission-tool
```

## 故障排除

### 身份验证问题

如果身份验证失败：
```bash
omnara --reauth
```

### 连接问题

检查你的 API 配置：
```bash
cat ~/.omnara/credentials.json
cat ~/.omnara/config.json
```

### 日志位置

日志存储在：
- Claude Code：`~/.omnara/claude_wrapper/<session-id>.log`
- Headless：`~/.omnara/claude_headless/<session-id>.log`
- Codex：`~/.omnara/codex_wrapper/<session-id>.log`
- Amp：`~/.omnara/amp_wrapper/<session-id>.log`

## 升级

```bash
# 使用 pip
pip install omnara --upgrade

# 使用 uv
uv tool upgrade omnara

# 使用 pipx
pipx upgrade omnara
```
