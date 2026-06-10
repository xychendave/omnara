# n8n 集成架构

## 概述

Omnara 的 n8n 集成（`n8n-nodes-omnara`）是一个社区节点包，使工作流能够通过 Omnara 平台与用户进行实时通信。它允许 n8n 工作流发送状态更新、提出问题，并通过网页、移动端、邮件和短信等待用户响应。

**核心能力：**
- **非阻塞消息**：在工作流继续运行的同时发送状态更新
- **阻塞式提问**：暂停工作流直到用户响应
- **AI Agent 兼容**：可作为 n8n AI Agent 的工具使用
- **多渠道通知**：邮件、短信和推送通知
- **会话管理**：跟踪并结束 agent 会话

## 架构

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   n8n       │         │     Omnara       │         │    User     │
│  Workflow   │────────▶│  Agent Server    │────────▶│  Dashboard  │
│             │  POST   │  (agent.omnara)  │  Real   │  Web/Mobile │
│             │ /messages│                  │  time   │             │
│             │         │                  │         │             │
│             │◀────────│  Stores in DB    │         │             │
│             │ Response│  + Sends Notifs  │         │             │
│             │         │                  │         │             │
│             │         │                  │◀────────│  Responds   │
│             │◀────────│  Webhook Trigger │  User   │             │
│  Resumes    │ POST    │  (async mode)    │ Message │             │
│             │         │                  │         │             │
└─────────────┘         └──────────────────┘         └─────────────┘
```

## 包结构

```
src/integrations/n8n/
├── src/
│   ├── credentials/
│   │   └── OmnaraApi.credentials.ts      # API key 认证
│   ├── nodes/
│   │   └── Omnara/
│   │       ├── Omnara.node.ts            # 主节点实现
│   │       ├── Omnara.node.json          # 节点元数据
│   │       ├── omnara.png                # 节点图标
│   │       └── actions/
│   │           ├── message/
│   │           │   ├── index.ts          # 操作描述
│   │           │   ├── send.operation.ts # 非阻塞发送
│   │           │   └── sendAndWait.operation.ts # 阻塞发送
│   │           └── session/
│   │               ├── index.ts
│   │               └── end.operation.ts  # 结束会话
│   └── utils/
│       ├── GenericFunctions.ts           # API 请求辅助函数
│       ├── sendAndWaitWebhook.ts         # webhook 处理器
│       └── sendAndWait/
│           ├── descriptions.ts           # webhook 配置
│           └── configureWaitTillDate.ts  # 超时配置
├── package.json
├── tsconfig.json
└── README.md
```

## 认证

### 凭证设置（`OmnaraApi.credentials.ts`）

该 n8n 节点使用 **Bearer token 认证**访问 Omnara 的 agent API：

```typescript
authenticate: IAuthenticateGeneric = {
  type: 'generic',
  properties: {
    headers: {
      Authorization: '=Bearer {{$credentials.apiKey}}'
    }
  }
}
```

**配置：**
- **API Key**：用户的 Omnara API key（从仪表盘获取）
- **服务器 URL**：默认为 `https://agent.omnara.com`（自托管时可自定义）
- **凭证测试**：通过调用 `/api/v1/auth/verify` 进行验证

**工作原理：**
1. 用户在 Omnara 仪表盘中创建 API key
2. API key 存储在 n8n 的凭证系统中
3. 每个 API 请求都包含 `Authorization: Bearer <api_key>` 请求头
4. Omnara 服务器验证 JWT 并提取 user_id
5. 所有操作的范围都限定为已认证用户

## 核心操作

### 1. 发送消息（非阻塞）

**目的**：发送信息性消息而无需等待响应

**实现**：`src/nodes/Omnara/actions/message/send.operation.ts:100`

**API 调用：**
```
POST /api/v1/messages/agent
{
  "agent_instance_id": "uuid",
  "agent_type": "agent_name",
  "content": "Status update text",
  "requires_user_input": false,
  "send_email": false,
  "send_sms": false,
  "send_push": false
}
```

**流程：**
1. n8n 节点接收要发送的消息
2. 向 Omnara agent 服务器发起 POST 请求
3. 服务器创建/更新 agent 实例
4. 将消息以 `sender_type=AGENT` 存入数据库
5. 根据用户偏好发送通知
6. 立即返回 message_id
7. 工作流继续运行，无需等待

**响应包含：**
- `message_id`：所创建消息的 ID
- `agent_instance_id`：实例 ID（若是新实例则会创建）
- `queued_user_messages`：任何待处理的用户响应（参见下文的排队消息）

### 2. 发送并等待（阻塞）

**目的**：提出问题并暂停，直到用户响应

**实现**：`src/nodes/Omnara/Omnara.node.ts:81`

**两种模式：**

#### 模式 A：Webhook 模式（异步）——工作流的默认模式

**工作原理：**
1. n8n 生成唯一的 webhook URL：`{resumeUrl}/{nodeId}`
2. 在元数据中携带 webhook URL 发送消息：
```json
{
  "agent_instance_id": "uuid",
  "content": "Question text",
  "requires_user_input": true,
  "message_metadata": {
    "webhook_url": "https://n8n.example.com/webhook-waiting/exec-123/node-456",
    "webhook_type": "n8n_send_and_wait",
    "execution_id": "exec-123",
    "node_id": "node-456"
  }
}
```
3. 调用 `putExecutionToWait()`——工作流暂停
4. 用户在 Omnara 仪表盘中响应
5. Omnara 触发 webhook 回调（`src/servers/shared/db/queries.py:490`）
6. n8n 接收到 webhook POST 并恢复工作流
7. 响应数据流向下一个节点

**Webhook 回调**（`src/utils/sendAndWaitWebhook.ts:12`）：
```typescript
export async function omnaraSendAndWaitWebhook(this: IWebhookFunctions) {
  const body = this.getBodyData();

  const responseData = {
    userResponse: body.user_message,
    userId: body.user_id,
    messageId: body.message_id,
    agentInstanceId: body.agent_instance_id,
    timestamp: body.timestamp
  };

  return {
    webhookResponse: { status: 200 },
    workflowData: [[{ json: responseData }]]
  };
}
```

**Omnara 服务器 webhook 触发**（`src/servers/shared/db/queries.py:490`）：
```python
def trigger_webhook_for_user_response(
    db: Session,
    agent_instance_id: UUID,
    user_message_content: str,
    user_message_id: str,
    user_id: str
):
    # 获取最后一条 requires_user_input=True 的 agent 消息
    last_agent_message = get_last_agent_message_waiting_for_input(...)

    # 从消息元数据中提取 webhook URL
    webhook_url = last_agent_message.message_metadata.get("webhook_url")

    # 携带用户响应触发 webhook
    response = httpx.post(webhook_url, json={
        "user_message": user_message_content,
        "user_id": user_id,
        "message_id": user_message_id,
        "agent_instance_id": str(agent_instance_id),
        "timestamp": datetime.now().isoformat()
    })

    # 标记为已触发以防止重复
    last_agent_message.message_metadata["webhook_triggered"] = True
```

#### 模式 B：同步模式（轮询）——用于 AI Agent

**为什么需要**：n8n 中的 AI Agent 无法正确支持异步的 `putExecutionToWait()`

**工作原理**（`src/nodes/Omnara/Omnara.node.ts:91`）：
1. 在元数据中携带 `sync_mode: true` 发送消息
2. 不发送 webhook URL
3. 每 5 秒轮询一次 `/api/v1/messages/pending`
4. 使用 `last_read_message_id` 检查用户响应
5. 找到响应或达到超时后返回
6. 同步执行——可在 AI Agent 上下文中工作

**轮询循环：**
```typescript
const syncTimeout = options.syncTimeout || 7200; // 2 小时
const pollInterval = options.pollInterval || 5; // 5 秒
const startTime = Date.now();

while (Date.now() - startTime < syncTimeout * 1000) {
  // 忙等待轮询间隔
  const pollStart = Date.now();
  while (Date.now() - pollStart < pollInterval * 1000) {
    await new Promise(resolve => resolve(undefined));
  }

  // 检查待处理消息
  const pending = await GET('/messages/pending', {
    agent_instance_id: agentInstanceId,
    last_read_message_id: lastReadMessageId
  });

  if (pending.messages.length > 0) {
    return pending.messages[pending.messages.length - 1];
  }
}

// 超时
return { success: false, error: 'Timeout' };
```

**关键区别：**
| 特性 | Webhook 模式 | 同步模式 |
|---------|--------------|-----------|
| **异步/等待** | 是 | 否（同步） |
| **资源占用** | 低（事件驱动） | 较高（轮询） |
| **AI Agent 兼容** | 否 | 是 |
| **最长等待时间** | 7 天 | 48 小时 |
| **使用场景** | 常规工作流 | AI Agent 工具 |

### 3. 结束会话

**目的**：将 agent 实例标记为已完成

**实现**：`src/nodes/Omnara/actions/session/end.operation.ts:28`

**API 调用：**
```
POST /api/v1/sessions/end
{
  "agent_instance_id": "uuid"
}
```

**发生的事情：**
1. 将 agent 实例的 `status = COMPLETED`
2. 为 `ended_at` 打上时间戳
3. 停止将其作为活跃会话跟踪
4. 实例保留在历史记录中

## Agent 实例管理

### 创建实例

**两种模式：**

#### 模式 1：webhook 触发（推荐）
```
1. 用户从 Omnara 仪表盘触发工作流
2. webhook 发送：
   - agent_instance_id: 预先生成的 UUID
   - agent_type: 来自仪表盘
   - prompt: 用户的消息
3. 所有 n8n 节点使用来自 webhook 的同一 instance_id
```

#### 模式 2：自行生成
```
1. 工作流生成 UUID：{{ $uuid() }}
2. 存储在 Set 节点变量中
3. 所有 n8n 节点引用相同的变量
```

### 实例生命周期

```
CREATE (first message) → ACTIVE → COMPLETED (end session)
                            ↓
                      Messages exchanged
```

**数据库操作**（`src/servers/shared/db/queries.py:70`）：
```python
def get_or_create_agent_instance(
    db: Session,
    agent_instance_id: str,
    user_id: str,
    agent_type: str | None
) -> AgentInstance:
    # 尝试获取已有实例
    instance = db.query(AgentInstance).filter(
        AgentInstance.id == agent_instance_id
    ).first()

    if instance:
        # 验证用户拥有该实例
        if str(instance.user_id) != user_id:
            raise ValueError("Access denied")
        return instance
    else:
        # 使用提供的 ID 创建新实例
        user_agent = create_or_get_user_agent(db, agent_type, user_id)
        instance = AgentInstance(
            id=agent_instance_id,  # 使用提供的 ID
            user_agent_id=user_agent.id,
            user_id=user_id,
            status=AgentStatus.ACTIVE
        )
        db.add(instance)
        return instance
```

## 消息系统集成

### 统一消息系统

所有消息存储在单一的 `messages` 表中，包含：
- `sender_type`：AGENT 或 USER
- `requires_user_input`：提问时为 True，状态更新时为 False
- `message_metadata`：用于存储 webhook URL、节点 ID 等的 JSON 字段

### 排队消息功能

**问题**：用户可能在 agent 的下一条消息之前就已响应
**解决方案**：随每条 agent 消息返回排队中的用户消息

**流程**（`src/servers/shared/db/queries.py:170`）：
```python
def create_agent_message(...):
    # 创建消息
    message = Message(
        agent_instance_id=instance.id,
        content=content,
        sender_type=SenderType.AGENT,
        requires_user_input=requires_user_input,
        message_metadata=message_metadata
    )
    db.add(message)

    # 获取自上次读取以来的所有用户消息
    queued_messages = get_unread_user_messages(
        db=db,
        agent_instance_id=instance.id,
        last_read_message_id=instance.last_read_message_id
    )

    return {
        "message_id": message.id,
        "queued_user_messages": queued_messages  # 自上次检查以来的用户响应
    }
```

**在 n8n 中**（`src/nodes/Omnara/actions/message/send.operation.ts:138`）：
```typescript
const response = await omnaraApiRequest.call(this, 'POST', '/messages/agent', body);

return [{
  json: {
    success: response.success,
    messageId: response.message_id,
    queuedUserMessages: response.queued_user_messages.map(formatMessageResponse)
  }
}];
```

**为什么这很重要：**
- agent 可以在每次发送消息时检查响应
- 在发送和等待操作之间不会遗漏任何消息
- 即使时机不对，用户响应也总能送达

## API 通信

### 辅助函数（`src/utils/GenericFunctions.ts`）

```typescript
export async function omnaraApiRequest(
  this: IExecuteFunctions | ILoadOptionsFunctions,
  method: IHttpRequestMethods,
  endpoint: string,
  body: IDataObject = {},
  qs: IDataObject = {}
): Promise<any> {
  const credentials = await this.getCredentials('omnaraApi');

  const options: IHttpRequestOptions = {
    method,
    body,
    qs,
    url: `${credentials.serverUrl}/api/v1${endpoint}`,
    json: true
  };

  return await this.helpers.httpRequestWithAuthentication.call(
    this,
    'omnaraApi',  // 凭证名称
    options
  );
}
```

**所有 API 调用：**
- 使用带认证的辅助函数（自动添加 Bearer token）
- 目标为 `/api/v1/*` 端点
- 返回 JSON 响应
- 失败时抛出 `NodeApiError`

### 使用的 API 端点

| Endpoint | Method | 用途 |
|----------|--------|---------|
| `/api/v1/messages/agent` | POST | 发送 agent 消息（send 与 sendAndWait 均使用） |
| `/api/v1/messages/pending` | GET | 轮询用户响应（同步模式） |
| `/api/v1/sessions/end` | POST | 结束 agent 会话 |
| `/api/v1/auth/verify` | GET | 验证凭证 |

## AI Agent 工具集成

### 配置

```typescript
export class Omnara implements INodeType {
  description: INodeTypeDescription = {
    // ... 其他配置
    usableAsTool: true,  // 启用 AI Agent 使用
  };
}
```

**这启用了什么：**
- AI Agent 可以将 Omnara 节点作为函数调用
- Agent 描述何时使用：“向用户询问输入”或“向用户发送更新”
- 参数以函数实参的形式传递

### 使用模式

```javascript
// AI Agent 决定向用户提问
await tools.omnara({
  resource: "message",
  operation: "sendAndWait",
  agentInstanceId: "current-instance-id",
  agentType: "claude_code",
  message: "Should I proceed with this change?",
  options: {
    syncMode: true,  // AI Agent 必须设置
    syncTimeout: 600,
    pollInterval: 5,
    sendEmail: true
  }
});
// 同步返回用户的响应
```

**关键**：必须使用 `syncMode: true`，因为 AI Agent 是同步运行的，无法处理异步的 `putExecutionToWait()`。

## 通知系统

### 通知偏好

**优先级（从高到低）：**
1. **消息级覆盖**：请求中的 `send_email`、`send_sms`、`send_push`
2. **用户偏好**：按用户存储在数据库中
3. **默认行为**：除非指定，否则不发送通知

### 何时发送通知

**触发条件：**
- 新的 agent 消息（状态更新或提问）
- `requires_user_input=true` → 更紧急的通知

**渠道：**
- **邮件**：始终可用，零配置
- **短信**：完成手机号验证后可用
- **推送**：通过移动应用或网页推送可用

**实现**（由 Omnara 后端处理，而非 n8n）：
```python
# 在 create_agent_message() 中
send_notifications(
    user_id=instance.user_id,
    agent_name=user_agent.name,
    message_content=content,
    requires_input=requires_user_input,
    email_override=send_email,
    sms_override=send_sms,
    push_override=send_push
)
```

## 错误处理

### 凭证错误

```typescript
if (!credentials) {
  throw new NodeApiError(this.getNode(), {
    message: 'No credentials found'
  });
}
```

### 操作错误

```typescript
try {
  const response = await omnaraApiRequest(...);
  return [{ json: response }];
} catch (error) {
  throw new NodeOperationError(
    this.getNode(),
    `Failed to send message: ${error.message}`,
    { itemIndex: index }
  );
}
```

### 失败时继续

```typescript
} catch (error) {
  if (this.continueOnFail()) {
    returnData.push({
      json: {
        error: error.message,
        resource,
        operation,
        itemIndex: i
      },
      pairedItem: i
    });
    continue;
  }
  throw error;
}
```

## 开发工作流

### 构建包

```bash
npm install          # 安装依赖
npm run build        # 编译 TypeScript → dist/
npm run copy-assets  # 复制 .png 和 .json 文件
```

**构建输出：**
```
dist/
├── credentials/
│   └── OmnaraApi.credentials.js
├── nodes/
│   └── Omnara/
│       ├── Omnara.node.js
│       ├── Omnara.node.json
│       └── omnara.png
└── utils/
    └── GenericFunctions.js
```

### 发布到 npm

```bash
npm run prepublishOnly  # 自动运行构建
npm publish            # 发布到 npm 仓库
```

**包名**：`n8n-nodes-omnara`
**仓库地址**：https://www.npmjs.com/package/n8n-nodes-omnara

### 本地测试

```bash
# 在 n8n-nodes-omnara 目录下
npm link

# 在 n8n 安装目录下
npm link n8n-nodes-omnara
```

## 与 Omnara 平台的集成点

### 后端 API（`src/servers/api/routers.py`）

```python
@router.post("/messages/agent")
async def create_message(
    request: CreateMessageRequest,
    user_id: str = Depends(verify_api_key_dependency)
):
    # 验证并创建 agent 实例
    instance = get_or_create_agent_instance(
        db, request.agent_instance_id, user_id, request.agent_type
    )

    # 在数据库中创建消息
    result = create_agent_message(
        db=db,
        agent_instance_id=instance.id,
        content=request.content,
        requires_user_input=request.requires_user_input,
        message_metadata=request.message_metadata,
        send_email=request.send_email,
        send_sms=request.send_sms,
        send_push=request.send_push,
        git_diff=request.git_diff
    )

    # 发送通知
    # 返回排队中的用户消息
    return result
```

### 数据库模型（`src/shared/models/`）

```python
class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID, primary_key=True)
    agent_instance_id = Column(UUID, ForeignKey("agent_instances.id"))
    content = Column(Text, nullable=False)
    sender_type = Column(Enum(SenderType))  # AGENT 或 USER
    requires_user_input = Column(Boolean, default=False)
    message_metadata = Column(JSON)  # 存储 webhook URL
    created_at = Column(DateTime(timezone=True))

class AgentInstance(Base):
    __tablename__ = "agent_instances"

    id = Column(UUID, primary_key=True)
    user_agent_id = Column(UUID, ForeignKey("user_agents.id"))
    user_id = Column(UUID, ForeignKey("users.id"))
    status = Column(Enum(AgentStatus))  # ACTIVE、COMPLETED、STALE
    last_read_message_id = Column(UUID)  # 用于排队消息
    git_diff = Column(Text)  # 可选的 git 上下文
    ended_at = Column(DateTime(timezone=True))
```

### 网页仪表盘（`apps/web/`）

**用户界面：**
- 实时消息显示（WebSocket 或轮询）
- 用于回应 agent 提问的文本输入框
- 通知偏好管理
- 会话历史与筛选

**响应流程：**
```
用户输入响应 → POST /messages/user →
触发 webhook（如果 n8n 正在等待）→
更新 UI 并显示确认
```

## 配置示例

### 示例 1：简单的状态更新

```javascript
// n8n 工作流
{
  "nodes": [
    {
      "name": "Build Project",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "code": "// 构建逻辑"
      }
    },
    {
      "name": "Notify Progress",
      "type": "n8n-nodes-omnara.omnara",
      "parameters": {
        "resource": "message",
        "operation": "send",
        "agentInstanceId": "{{ $('Set').json.instanceId }}",
        "agentType": "CI/CD Agent",
        "message": "Build completed successfully! ✅",
        "additionalOptions": {
          "sendPush": true
        }
      }
    }
  ]
}
```

### 示例 2：审批工作流

```javascript
{
  "nodes": [
    {
      "name": "Prepare Deployment",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "code": "// 部署准备"
      }
    },
    {
      "name": "Request Approval",
      "type": "n8n-nodes-omnara.omnara",
      "parameters": {
        "resource": "message",
        "operation": "sendAndWait",
        "agentInstanceId": "{{ $('Set').json.instanceId }}",
        "agentType": "Deployment Agent",
        "message": "Ready to deploy to production. Approve?",
        "options": {
          "sendEmail": true,
          "sendPush": true
        },
        "limitWaitTime": true,
        "limitType": "afterTimeInterval",
        "resumeAmount": 1,
        "resumeUnit": "hours"
      }
    },
    {
      "name": "Deploy",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "code": "// 仅在获批后部署"
      }
    }
  ]
}
```

### 示例 3：使用同步模式的 AI Agent

```javascript
{
  "nodes": [
    {
      "name": "AI Agent",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "parameters": {
        "tools": ["omnara"],
        "prompt": "You are a helpful assistant. Use Omnara to ask the user for clarification when needed."
      }
    },
    {
      "name": "Omnara Tool Config",
      "type": "n8n-nodes-omnara.omnara",
      "parameters": {
        "resource": "message",
        "operation": "sendAndWait",
        "agentInstanceId": "{{ $json.agentInstanceId }}",
        "agentType": "AI Assistant",
        "message": "{{ $json.question }}",
        "options": {
          "syncMode": true,      // AI Agent 必须设置
          "syncTimeout": 600,    // 10 分钟超时
          "pollInterval": 5,     // 每 5 秒检查一次
          "sendEmail": true,
          "sendPush": true
        }
      }
    }
  ]
}
```

## 要点总结

1. **两种消息类型**：
   - **Send**：非阻塞的状态更新（工作流立即继续）
   - **Send and Wait**：阻塞式提问（工作流暂停直到收到响应）

2. **两种等待模式**：
   - **Webhook 模式**：高效、事件驱动（常规工作流）
   - **同步模式**：基于轮询（AI Agent 工具）

3. **webhook 的奥妙**：
   - n8n 为每次执行生成唯一的 webhook URL
   - Omnara 将 URL 存储在消息元数据中
   - 用户响应触发 webhook → 工作流恢复
   - 一次性使用，自动清理

4. **Agent 实例 = 对话线程**：
   - 工作流中所有节点使用相同的 `agent_instance_id`
   - 将所有消息归为一组
   - 在仪表盘中作为单个会话跟踪

5. **排队消息**：
   - 每条 agent 消息都会返回待处理的用户响应
   - 防止消息遗漏
   - 即使时机不对也能正常工作

6. **AI Agent 兼容性**：
   - 必须使用 `syncMode: true`
   - 使用同步轮询而非异步 webhook
   - 在节点配置中设置 `usableAsTool: true`

7. **认证**：
   - Authorization 请求头中的 Bearer token（JWT）
   - 操作限定在用户范围内（无法访问其他用户的实例）
   - API key 从仪表盘获取

## 相关文件

- **n8n 节点**：`src/integrations/n8n/src/nodes/Omnara/Omnara.node.ts`
- **webhook 处理器**：`src/integrations/n8n/src/utils/sendAndWaitWebhook.ts`
- **API 模型**：`src/servers/api/models.py`
- **数据库查询**：`src/servers/shared/db/queries.py`
- **认证**：`src/servers/api/auth.py`
- **用户 README**：`src/integrations/n8n/README.md`
