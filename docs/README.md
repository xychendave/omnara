# docs/

本目录包含 Omnara 项目的文档。

## 目录结构

- **`cli/`** - CLI 命令参考
  - `overview.mdx` - CLI 概览与安装
  - `commands/` - 各命令的文档
    - `default.mdx` - 默认交互式命令
    - `terminal.mdx` - WebSocket 中继流式传输
    - `headless.mdx` - 后台模式
    - `serve.mdx` - Webhook 服务器
    - `mcp.mdx` - MCP stdio 服务器
  - `agents.mdx` - 智能体配置
  - `environment-variables.mdx` - 环境变量参考
  - `config-files.mdx` - 配置文件指南

- **`integrations/`** - 集成指南
  - `n8n.mdx` - n8n 工作流集成
  - `github-actions.mdx` - GitHub Actions 集成
  - `mcp-clients.mdx` - MCP 客户端配置

- **`api/`** - API 文档
  - `overview.mdx` - REST API 概览
  - `authentication.mdx` - API 认证
  - `sdk.mdx` - Python SDK 文档

- **`assets/`** - 文档资源
  - 图片、图表和截图
  - Logo 和网站图标
  - UI 原型图和线框图

- **`guides/`** - 开发者指南
  - 架构文档
  - 开发工作流

## 入门页面

- `introduction.mdx` - 产品介绍与概览
- `quickstart.mdx` - 快速开始指南
- `authentication.mdx` - 认证设置

## 配置

- `mint.json` - Mintlify 配置，包含导航、品牌和元数据

## 查看文档

在本地预览文档：

```bash
npm i -g mintlify
mintlify dev
```

然后访问 `http://localhost:3000`

## 部署

文档已配置为部署到 Mintlify 托管服务。部署说明请参见 [mintlify.com/docs](https://mintlify.com/docs)。
