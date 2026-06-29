# Dify 前端 AI 对话模块开发文档

## 一、概述

Dify 前端提供了一套完整的 AI 对话组件体系，支持流式消息、Agent 思考、工具调用、RAG 引用等多种对话模式。

## 二、核心架构

### 2.1 组件结构

```
web/app/components/base/chat/
├── types.ts                    # 类型定义
├── utils.ts                    # 工具函数
├── constants.ts                # 常量
├── chat/                       # 核心聊天组件
│   ├── index.tsx               # Chat 主组件
│   ├── hooks.ts                # useChat Hook
│   ├── type.ts                 # 聊天项类型
│   ├── context.ts              # 上下文
│   ├── context-provider.tsx    # 上下文提供者
│   ├── chat-input-area/        # 输入区域
│   │   ├── index.tsx
│   │   ├── hooks.ts
│   │   └── operation.tsx
│   ├── answer/                 # 回答展示
│   │   ├── index.tsx
│   │   ├── basic-content.tsx
│   │   ├── agent-content.tsx
│   │   ├── tool-detail.tsx
│   │   ├── human-input-content/
│   │   └── ...
│   ├── question.tsx            # 问题展示
│   ├── loading-anim/           # 加载动画
│   ├── citation/               # RAG 引用
│   ├── thought/                # Agent 思考
│   └── ...
├── chat-with-history/          # 带历史记录的聊天
└── embedded-chatbot/           # 嵌入式聊天机器人
```

### 2.2 组件关系图

```
┌─────────────────────────────────────────────────────────────┐
│                      Chat (主组件)                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐               │
│  │  Question       │    │    Answer       │               │
│  │  (用户提问)      │    │   (AI回答)      │               │
│  └────────┬────────┘    └────────┬────────┘               │
│           │                      │                         │
│           │                      ├── BasicContent          │
│           │                      ├── AgentContent          │
│           │                      ├── Citation              │
│           │                      ├── ToolDetail            │
│           │                      └── WorkflowProcess       │
│           ▼                                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            ChatInputArea (输入区域)                  │   │
│  │  ├── Textarea          ├── VoiceInput               │   │
│  │  ├── FileUpload        └── FeatureBar               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 三、核心类型定义

### 3.1 ChatItem（聊天项）

```typescript
export type IChatItem = {
  id: string                              // 消息ID
  content: string                         // 消息内容
  citation?: CitationItem[]               // RAG引用
  isAnswer: boolean                       // 是否为回答
  feedback?: FeedbackType                 // 用户反馈
  adminFeedback?: FeedbackType            // 管理员反馈
  feedbackDisabled?: boolean              // 是否禁用反馈
  more?: MessageMore                      // 更多信息（时间、token、延迟）
  annotation?: Annotation                 // 标注信息
  useCurrentUserAvatar?: boolean          // 使用当前用户头像
  isOpeningStatement?: boolean            // 是否为开场语句
  suggestedQuestions?: string[]           // 推荐问题
  log?: { role: string, text: string, files?: FileEntity[] }[]  // 日志
  agent_thoughts?: ThoughtItem[]          // Agent思考
  message_files?: FileEntity[]            // 消息附件
  workflow_run_id?: string                // 工作流运行ID
  conversationId?: string                 // 会话ID
  input?: any                             // 输入参数
  parentMessageId?: string | null         // 父消息ID（用于分支）
  siblingCount?: number                   // 兄弟节点数量
  siblingIndex?: number                   // 当前兄弟节点索引
  prevSibling?: string                    // 上一个兄弟
  nextSibling?: string                    // 下一个兄弟
  humanInputFormDataList?: HumanInputFormData[]        // 人工输入表单
  humanInputFilledFormDataList?: HumanInputFilledFormData[]  // 已填写表单
  extra_contents?: ExtraContent[]         // 额外内容
}
```

### 3.2 ChatConfig（聊天配置）

```typescript
export type ChatConfig = Omit<ModelConfig, 'model'> & {
  supportAnnotation?: boolean             // 支持标注
  appId?: string                          // 应用ID
  questionEditEnable?: boolean            // 支持问题编辑
  supportFeedback?: boolean               // 支持反馈
  supportCitationHitInfo?: boolean        // 支持引用命中信息
  system_parameters: {
    audio_file_size_limit: number         // 音频文件大小限制
    file_size_limit: number               // 文件大小限制
    image_file_size_limit: number         // 图片文件大小限制
    video_file_size_limit: number         // 视频文件大小限制
    workflow_file_upload_limit: number    // 工作流文件上传限制
  }
  more_like_this: {
    enabled: boolean                      // 相似推荐
  }
}
```

### 3.3 ThoughtItem（Agent 思考）

```typescript
export type ThoughtItem = {
  id: string
  tool: string                            // 工具类型（plugin/dataset）
  thought: string                         // 思考内容
  tool_input: string                      // 工具输入
  tool_labels?: { [key: string]: TypeWithI18N }
  message_id: string                      // 消息ID
  conversation_id: string                 // 会话ID
  observation: string                     // 观察结果
  position: number                        // 位置
  files?: string[]                        // 文件列表
  message_files?: FileEntity[]            // 消息文件
}
```

### 3.4 CitationItem（RAG 引用）

```typescript
export type CitationItem = {
  content: string                         // 引用内容
  data_source_type: string                // 数据源类型
  dataset_name: string                    // 数据集名称
  dataset_id: string                      // 数据集ID
  document_id: string                     // 文档ID
  document_name: string                   // 文档名称
  hit_count: number                       // 命中次数
  index_node_hash: string                 // 索引节点哈希
  segment_id: string                      // 段落ID
  segment_position: number                // 段落位置
  score: number                           // 匹配分数
  word_count: number                      // 字数
}
```

## 四、核心组件详解

### 4.1 Chat 组件

**位置**: `web/app/components/base/chat/chat/index.tsx`

**职责**: 聊天容器组件，负责渲染消息列表和输入区域

**关键属性**:

| 属性 | 类型 | 说明 |
|------|------|------|
| `chatList` | `ChatItem[]` | 聊天消息列表 |
| `config` | `ChatConfig` | 聊天配置 |
| `isResponding` | `boolean` | 是否正在响应 |
| `onSend` | `OnSend` | 发送消息回调 |
| `onRegenerate` | `OnRegenerate` | 重新生成回调 |
| `onFeedback` | `Function` | 反馈回调 |
| `readonly` | `boolean` | 是否只读模式 |

**渲染逻辑**:
- 遍历 `chatList`，根据 `isAnswer` 区分问题和回答
- 问题渲染为 `Question` 组件
- 回答渲染为 `Answer` 组件
- 底部渲染输入区域 `ChatInputArea`

**代码示例 (Demo)**:

```tsx
import { useState } from 'react'
import Chat from '@/app/components/base/chat/chat'
import type { ChatItem, OnSend } from '@/app/components/base/chat/types'

const MyChatApp = () => {
  const [chatList, setChatList] = useState<ChatItem[]>([])
  const [isResponding, setIsResponding] = useState(false)

  const onSend: OnSend = async (message) => {
    // 添加用户问题
    const question: ChatItem = {
      id: Date.now().toString(),
      content: message,
      isAnswer: false,
    }
    
    // 添加AI回答占位符
    const answer: ChatItem = {
      id: (Date.now() + 1).toString(),
      content: '',
      isAnswer: true,
    }

    setChatList([...chatList, question, answer])
    setIsResponding(true)

    // 模拟AI响应
    setTimeout(() => {
      setChatList(prev => prev.map(item => 
        item.id === answer.id 
          ? { ...item, content: '这是AI的回答内容...' }
          : item
      ))
      setIsResponding(false)
    }, 1500)
  }

  return (
    <div className="h-screen">
      <Chat
        chatList={chatList}
        isResponding={isResponding}
        onSend={onSend}
        showFileUpload={true}
      />
    </div>
  )
}
```

### 4.2 useChat Hook

**位置**: `web/app/components/base/chat/chat/hooks.ts`

**职责**: 管理聊天状态和消息发送逻辑

**核心功能**:

| 方法 | 说明 |
|------|------|
| `handleSend` | 发送消息，建立 SSE 连接 |
| `handleStop` | 停止响应 |
| `handleRestart` | 重置聊天 |
| `handleResume` | 恢复中断的工作流 |
| `updateChatTreeNode` | 更新聊天树节点 |

**状态管理**:
- `chatTree`: 聊天消息树结构（支持分支）
- `threadMessages`: 当前线程消息列表
- `isResponding`: 响应状态
- `suggestedQuestions`: 推荐问题

**SSE 事件处理**:

```typescript
// 事件类型
onData: (message, isFirstMessage, { conversationId, messageId, taskId }) => void
onCompleted: (hasError?) => void
onFile: (file) => void                    // 处理文件消息
onThought: (thought) => void              // 处理Agent思考
onMessageEnd: (messageEnd) => void        // 消息结束
onMessageReplace: (messageReplace) => void // 消息替换
onWorkflowStarted: ({ workflow_run_id, task_id }) => void
onWorkflowFinished: ({ data }) => void
onNodeStarted: ({ data }) => void
onNodeFinished: ({ data }) => void
onHumanInputRequired: ({ data }) => void  // 需要人工输入
onTTSChunk: (messageId, audio) => void    // TTS 语音片段
onTTSEnd: (messageId, audio) => void      // TTS 结束
```

**代码示例 (Demo)**:

```tsx
import { useChat } from '@/app/components/base/chat/chat/hooks'

const {
  chatTree,
  threadMessages,
  isResponding,
  suggestedQuestions,
  handleSend,
  handleStop,
  handleRestart,
} = useChat({
  conversationId: 'conv-123',
  onSendMessage: async (message, options) => {
    // 发送消息到后端
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        conversation_id: options.conversationId,
      }),
    })
    return response
  },
})

// 使用示例
const handleUserInput = (message: string) => {
  handleSend(message)
}

const handleStopResponse = () => {
  handleStop()
}
```

### 4.3 ChatInputArea 组件

**位置**: `web/app/components/base/chat/chat/chat-input-area/index.tsx`

**职责**: 聊天输入区域，支持文本、语音、文件输入

**功能特性**:
- 自动调整高度的文本框
- 语音输入（Speech-to-Text）
- 文件拖拽上传
- 快捷键支持（Enter发送，Cmd+上下键历史）
- 多语言输入支持（IME 组合输入）

**快捷键**:

| 组合键 | 功能 |
|--------|------|
| `Enter` | 发送消息（默认） |
| `Shift+Enter` | 换行 |
| `Cmd/Ctrl + ArrowUp` | 上一条历史 |
| `Cmd/Ctrl + ArrowDown` | 下一条历史 |

**代码示例 (Demo)**:

```tsx
import ChatInputArea from '@/app/components/base/chat/chat/chat-input-area'
import type { OnSend } from '@/app/components/base/chat/types'

const MyChatInput = () => {
  const onSend: OnSend = (message, files) => {
    console.log('发送消息:', message)
    console.log('附加文件:', files)
    // 发送逻辑
  }

  const visionConfig = {
    enabled: true,
    image: true,
    video: true,
    audio: true,
    file: true,
  }

  const speechToTextConfig = {
    enabled: true,
  }

  return (
    <ChatInputArea
      botName="AI助手"
      onSend={onSend}
      showFileUpload={true}
      showFeatureBar={true}
      visionConfig={visionConfig}
      speechToTextConfig={speechToTextConfig}
      isResponding={false}
      disabled={false}
      sendOnEnter={true}
    />
  )
}
```

### 4.4 Answer 组件

**位置**: `web/app/components/base/chat/chat/answer/index.tsx`

**职责**: 渲染 AI 回答内容

**渲染逻辑**:
1. **Workflow Process**: 如果有工作流，显示流程追踪
2. **Human Input Forms**: 处理需要人工输入的表单
3. **Content**: 根据类型渲染不同内容
   - `BasicContent`: 普通文本内容
   - `AgentContent`: Agent 模式内容（包含思考过程）
4. **Files**: 显示消息附件
5. **Citation**: RAG 引用展示
6. **Suggested Questions**: 推荐问题

**代码示例 (Demo)**:

```tsx
import Answer from '@/app/components/base/chat/chat/answer'
import type { ChatItem } from '@/app/components/base/chat/types'

const MyAnswer = () => {
  const answerItem: ChatItem = {
    id: 'answer-1',
    isAnswer: true,
    content: '这是AI生成的回答内容，支持**Markdown**格式。\n\n```javascript\nconsole.log("Hello World");\n```',
    citation: [
      {
        content: '引用的文档内容片段...',
        data_source_type: 'dataset',
        dataset_name: '知识库',
        dataset_id: 'ds-123',
        document_id: 'doc-456',
        document_name: '技术文档',
        hit_count: 2,
        index_node_hash: 'hash-xxx',
        segment_id: 'seg-789',
        segment_position: 1,
        score: 0.95,
        word_count: 50,
      },
    ],
    agent_thoughts: [
      {
        id: 'thought-1',
        tool: 'web_search',
        thought: '用户问的是关于天气的问题，需要调用搜索工具获取最新天气信息。',
        tool_input: '北京今天天气',
        tool_labels: {},
        message_id: 'answer-1',
        conversation_id: 'conv-123',
        observation: '北京今天晴天，温度25度',
        position: 0,
      },
    ],
    suggestedQuestions: ['明天天气怎么样？', '上海天气如何？'],
  }

  return (
    <div className="w-full px-10 py-5">
      <Answer
        item={answerItem}
        question="北京今天天气怎么样？"
        index={0}
        responding={false}
        showPromptLog={true}
      />
    </div>
  )
}
```

### 4.5 AgentContent 组件

**职责**: 渲染 Agent 思考过程

**特性**:
- 显示工具调用链
- 展示思考步骤
- 支持代码高亮
- 显示工具输入输出

**代码示例 (Demo)**:

```tsx
import AgentContent from '@/app/components/base/chat/chat/answer/agent-content'
import type { ThoughtItem } from '@/app/components/base/chat/types'

const MyAgentContent = () => {
  const thoughts: ThoughtItem[] = [
    {
      id: 'thought-1',
      tool: 'web_search',
      thought: '用户询问最新的科技新闻，需要搜索最新信息。',
      tool_input: JSON.stringify({ query: '2024年科技新闻' }),
      tool_labels: {},
      message_id: 'msg-1',
      conversation_id: 'conv-1',
      observation: '2024年AI技术取得重大突破，GPT-5发布...',
      position: 0,
    },
    {
      id: 'thought-2',
      tool: 'calculator',
      thought: '用户需要计算，调用计算器工具。',
      tool_input: '25 * 4 + 100',
      tool_labels: {},
      message_id: 'msg-1',
      conversation_id: 'conv-1',
      observation: '200',
      position: 1,
    },
  ]

  return (
    <AgentContent
      thoughts={thoughts}
      isFinished={true}
    />
  )
}
```

### 4.6 Citation 组件

**职责**: 渲染 RAG 引用信息

**特性**:
- 显示引用来源
- 命中次数统计
- 匹配分数展示
- 支持点击查看详情

**代码示例 (Demo)**:

```tsx
import Citation from '@/app/components/base/chat/chat/citation'
import type { CitationItem } from '@/app/components/base/chat/types'

const MyCitation = () => {
  const citationData: CitationItem[] = [
    {
      content: '这是文档中的引用内容片段，用于支持回答的准确性。',
      data_source_type: 'dataset',
      dataset_name: '技术知识库',
      dataset_id: 'ds-tech-001',
      document_id: 'doc-123',
      document_name: 'AI技术白皮书',
      hit_count: 3,
      index_node_hash: 'abc123',
      segment_id: 'seg-001',
      segment_position: 1,
      score: 0.92,
      word_count: 150,
    },
    {
      content: '另一篇相关文档的引用内容...',
      data_source_type: 'dataset',
      dataset_name: '技术知识库',
      dataset_id: 'ds-tech-001',
      document_id: 'doc-456',
      document_name: '机器学习入门指南',
      hit_count: 2,
      index_node_hash: 'def456',
      segment_id: 'seg-002',
      segment_position: 3,
      score: 0.85,
      word_count: 80,
    },
  ]

  return (
    <Citation
      data={citationData}
      showHitInfo={true}
      containerClassName="chat-answer-container"
    />
  )
}
```

### 4.7 Question 组件

**职责**: 渲染用户问题

**代码示例 (Demo)**:

```tsx
import Question from '@/app/components/base/chat/chat/question'
import { User } from '@/app/components/base/icons/src/public/avatar'
import type { ChatItem } from '@/app/components/base/chat/types'

const MyQuestion = () => {
  const questionItem: ChatItem = {
    id: 'question-1',
    content: '你好，请问如何使用Dify创建一个AI应用？',
    isAnswer: false,
  }

  return (
    <Question
      item={questionItem}
      questionIcon={
        <div className="h-full w-full rounded-full border-[0.5px] border-black/5">
          <User className="size-full" />
        </div>
      }
      enableEdit={true}
    />
  )
}
```

### 4.8 Thought 组件

**职责**: 渲染单个 Agent 思考步骤

**代码示例 (Demo)**:

```tsx
import Thought from '@/app/components/base/chat/chat/thought'
import type { ThoughtItem } from '@/app/components/base/chat/types'

const MyThought = () => {
  const thought: ThoughtItem = {
    id: 'thought-1',
    tool: 'web_search',
    thought: '用户询问最新的市场动态，需要调用搜索工具获取信息。',
    tool_input: JSON.stringify({ query: '2024年股票市场分析' }),
    tool_labels: {
      toolName: { language: 'zh', text: '网页搜索' },
    },
    message_id: 'msg-1',
    conversation_id: 'conv-1',
    observation: '根据最新数据，市场表现良好...',
    position: 0,
  }

  return (
    <Thought
      thought={thought}
      isFinished={true}
    />
  )
}
```

### 4.9 TryToAsk 组件

**职责**: 渲染推荐问题列表

**代码示例 (Demo)**:

```tsx
import TryToAsk from '@/app/components/base/chat/chat/try-to-ask'
import type { OnSend } from '@/app/components/base/chat/types'

const MyTryToAsk = () => {
  const onSend: OnSend = (message) => {
    console.log('发送推荐问题:', message)
    // 发送逻辑
  }

  const suggestedQuestions = [
    '什么是人工智能？',
    '如何训练机器学习模型？',
    '推荐一些学习资源',
  ]

  return (
    <TryToAsk
      suggestedQuestions={suggestedQuestions}
      onSend={onSend}
    />
  )
}
```

## 五、聊天树结构

### 5.1 数据结构

Dify 支持对话分支功能，聊天消息以树形结构存储：

**代码示例 (Demo)**:

```tsx
import { buildChatItemTree, getThreadMessages } from '@/app/components/base/chat/utils'
import type { ChatItem, ChatItemInTree } from '@/app/components/base/chat/types'

// 示例消息列表
const messages: ChatItem[] = [
  {
    id: 'msg-1',
    content: '你好',
    isAnswer: false,
    parentMessageId: null,
  },
  {
    id: 'msg-2',
    content: '你好！有什么可以帮你的？',
    isAnswer: true,
    parentMessageId: 'msg-1',
  },
  {
    id: 'msg-3',
    content: '介绍一下Dify',
    isAnswer: false,
    parentMessageId: 'msg-2',
  },
  {
    id: 'msg-4',
    content: 'Dify是一个开源的LLM应用开发平台...',
    isAnswer: true,
    parentMessageId: 'msg-3',
  },
  // 分支消息
  {
    id: 'msg-5',
    content: 'Dify支持多种模型...',
    isAnswer: true,
    parentMessageId: 'msg-3',
    prevSibling: 'msg-4',
    siblingIndex: 1,
    siblingCount: 2,
  },
]

// 构建树结构
const chatTree: ChatItemInTree[] = buildChatItemTree(messages)

// 获取当前线程消息
const threadMessages: ChatItemInTree[] = getThreadMessages(chatTree, 'msg-4')

console.log('树结构:', chatTree)
console.log('当前线程:', threadMessages)
```

```typescript
export type ChatItemInTree = {
  children?: ChatItemInTree[]
} & ChatItem
```

### 5.2 构建逻辑

```typescript
// 从线性消息列表构建树
function buildChatItemTree(allMessages: IChatItem[]): ChatItemInTree[] {
  // 1. 遍历消息，成对处理（问题+回答）
  // 2. 根据 parentMessageId 建立父子关系
  // 3. 支持 Legacy 格式（parentMessageId === UUID_NIL）
  // 4. 返回根节点数组
}

// 获取当前线程消息
function getThreadMessages(tree: ChatItemInTree[], targetMessageId?: string): ChatItemInTree[] {
  // 1. BFS 查找目标消息路径
  // 2. 追加所有后代消息
  // 3. 返回线性化的线程消息
}
```

### 5.3 分支切换

支持同一问题的多个回答分支切换：

```typescript
// 切换到上一个/下一个兄弟回答
const handleSwitchSibling = (direction: 'prev' | 'next') => {
  if (direction === 'prev' && item.prevSibling) {
    switchSibling(item.prevSibling)
  } else if (direction === 'next' && item.nextSibling) {
    switchSibling(item.nextSibling)
  }
}
```

## 六、消息发送流程

### 6.1 完整流程

```
用户输入 → 验证 → 构建请求 → SSE连接 → 接收响应 → 更新UI

1. 用户输入消息
   ↓
2. 验证输入（非空、文件上传完成）
   ↓
3. 创建占位符消息（question + answer）
   ↓
4. 发送 SSE POST 请求
   ↓
5. 接收流式响应（onData）
   ↓
6. 实时更新消息内容
   ↓
7. 消息结束（onCompleted）
   ↓
8. 获取推荐问题（可选）
```

### 6.2 请求参数

```typescript
const bodyParams = {
  response_mode: 'streaming',             // 流式响应
  conversation_id: conversationId,        // 会话ID
  files: processedFiles,                  // 处理后的文件
  query: message,                        // 用户查询
  inputs: processedInputs,               // 表单输入
  parent_message_id: parentMessageId,     // 父消息ID（分支）
}
```

### 6.3 SSE 响应格式

```typescript
// 文本数据
{ type: 'data', data: 'Hello' }

// 文件数据
{ type: 'file', data: { id, type, url } }

// Agent思考
{ type: 'thought', data: ThoughtItem }

// 消息结束
{ type: 'message_end', data: { metadata, files } }

// 工作流事件
{ type: 'workflow_started', data: { workflow_run_id, task_id } }
{ type: 'node_started', data: { node_id, ... } }
{ type: 'node_finished', data: { node_id, status, ... } }
```

## 七、上下文管理

### 7.1 ChatContext

```typescript
// 上下文内容
const ChatContext = createContext({
  readonly: false,
  config: null,
  chatList: [],
  isResponding: false,
  showPromptLog: false,
  questionIcon: null,
  answerIcon: null,
  onSend: noop,
  onRegenerate: noop,
  onAnnotationAdded: noop,
  onAnnotationEdited: noop,
  onAnnotationRemoved: noop,
  disableFeedback: false,
  onFeedback: noop,
  getHumanInputNodeData: null,
})
```

### 7.2 使用方式

```tsx
const { onSend, onFeedback } = useChatContext()

// 发送消息
onSend(message, files)

// 提交反馈
onFeedback(messageId, { rating: 'like', content: 'Great!' })
```

**代码示例 (Demo)**:

```tsx
import { useChatContext } from '@/app/components/base/chat/chat/context'
import type { Feedback } from '@/app/components/base/chat/types'

const MyChatContextUsage = () => {
  const {
    readonly,
    config,
    chatList,
    isResponding,
    showPromptLog,
    questionIcon,
    answerIcon,
    onSend,
    onRegenerate,
    onFeedback,
    disableFeedback,
  } = useChatContext()

  const handleSendMessage = (message: string) => {
    if (!readonly && onSend) {
      onSend(message, [])
    }
  }

  const handleGiveFeedback = (messageId: string, rating: 'like' | 'dislike') => {
    if (!disableFeedback && onFeedback) {
      const feedback: Feedback = {
        rating,
        content: rating === 'like' ? '很有帮助' : '需要改进',
      }
      onFeedback(messageId, feedback)
    }
  }

  return (
    <div>
      <button onClick={() => handleSendMessage('Hello')}>
        发送消息
      </button>
      <button onClick={() => handleGiveFeedback('msg-1', 'like')}>
        👍 点赞
      </button>
      <button onClick={() => handleGiveFeedback('msg-1', 'dislike')}>
        👎 点踩
      </button>
    </div>
  )
}
```

## 八、工具调用与 Human Input

### 8.1 工具调用流程

```
Agent决定调用工具 → 发送工具输入 → 接收工具输出 → 继续思考

1. Agent产生思考（onThought）
   ↓
2. 显示工具调用信息
   ↓
3. 接收工具执行结果
   ↓
4. 更新思考内容
   ↓
5. 继续生成回答
```

**代码示例 (Demo)**:

```tsx
import { useState } from 'react'
import Thought from '@/app/components/base/chat/chat/thought'
import type { ThoughtItem } from '@/app/components/base/chat/types'

const ToolCallDemo = () => {
  const [thoughts, setThoughts] = useState<ThoughtItem[]>([])
  const [isFinished, setIsFinished] = useState(false)

  // 模拟工具调用过程
  const simulateToolCall = () => {
    setIsFinished(false)
    
    // 第一步：搜索工具
    const searchThought: ThoughtItem = {
      id: 'thought-1',
      tool: 'web_search',
      thought: '用户需要查询天气，调用天气API获取数据。',
      tool_input: JSON.stringify({ city: '北京', date: '2024-01-15' }),
      tool_labels: {},
      message_id: 'msg-1',
      conversation_id: 'conv-1',
      observation: '',
      position: 0,
    }
    setThoughts([searchThought])

    // 模拟工具返回结果
    setTimeout(() => {
      setThoughts(prev => prev.map(t => 
        t.id === 'thought-1' 
          ? { ...t, observation: '北京今天晴天，温度 -5 到 5 度' }
          : t
      ))

      // 第二步：总结工具
      const summaryThought: ThoughtItem = {
        id: 'thought-2',
        tool: 'summary',
        thought: '已获取天气信息，整理回答。',
        tool_input: JSON.stringify({ data: '北京天气数据' }),
        tool_labels: {},
        message_id: 'msg-1',
        conversation_id: 'conv-1',
        observation: '天气信息已整理完成',
        position: 1,
      }
      setThoughts(prev => [...prev, summaryThought])
      setIsFinished(true)
    }, 1500)
  }

  return (
    <div>
      <button onClick={simulateToolCall}>
        模拟工具调用
      </button>
      <div className="mt-4">
        {thoughts.map(thought => (
          <Thought
            key={thought.id}
            thought={thought}
            isFinished={isFinished}
          />
        ))}
      </div>
    </div>
  )
}
```

### 8.2 Human Input 流程

当工作流需要人工介入时：

```
工作流暂停 → 显示表单 → 用户填写 → 提交继续

1. 收到 human_input_required 事件
   ↓
2. 显示 HumanInputFormList 组件
   ↓
3. 用户填写表单
   ↓
4. 调用 onHumanInputFormSubmit
   ↓
5. 继续工作流执行
   ↓
6. 收到 human_input_form_filled 事件
   ↓
7. 显示已填写表单
```

**代码示例 (Demo)**:

```tsx
import { useState } from 'react'
import Answer from '@/app/components/base/chat/chat/answer'
import type { ChatItem, HumanInputFormData } from '@/app/components/base/chat/types'

const HumanInputDemo = () => {
  const [formData, setFormData] = useState<Record<string, any>>({})

  const answerItem: ChatItem = {
    id: 'answer-with-form',
    isAnswer: true,
    content: '需要您提供以下信息以继续...',
    humanInputFormDataList: [
      {
        id: 'form-1',
        formToken: 'token-123',
        formData: [
          {
            id: 'field-1',
            label: '您的姓名',
            type: 'text',
            required: true,
            placeholder: '请输入姓名',
          },
          {
            id: 'field-2',
            label: '联系电话',
            type: 'tel',
            required: false,
            placeholder: '请输入电话',
          },
        ],
      } as unknown as HumanInputFormData,
    ],
  }

  const handleHumanInputFormSubmit = async (formToken: string, data: any) => {
    setFormData(data)
    // 提交表单数据到后端
    console.log('提交表单:', formToken, data)
    // 返回继续工作流
  }

  return (
    <div className="w-full px-10 py-5">
      <Answer
        item={answerItem}
        question="开始工作流"
        index={0}
        responding={false}
        onHumanInputFormSubmit={handleHumanInputFormSubmit}
      />
    </div>
  )
}
```

## 九、样式与主题

### 9.1 主题变量

```typescript
type ThemeBuilder = {
  theme: Theme | null
}

type Theme = {
  primaryColor: string
  backgroundColor: string
  textColor: string
  // ... 其他主题属性
}
```

### 9.2 响应式设计

- 支持移动端适配
- 自适应容器宽度
- 响应式布局切换

**代码示例 (Demo)**:

```tsx
import Chat from '@/app/components/base/chat/chat'
import type { ChatItem, OnSend, ThemeBuilder } from '@/app/components/base/chat/types'
import { useState } from 'react'

const ThemedChatDemo = () => {
  const [chatList, setChatList] = useState<ChatItem[]>([])
  
  const themeBuilder: ThemeBuilder = {
    theme: {
      primaryColor: '#6366f1',
      backgroundColor: '#ffffff',
      textColor: '#1f2937',
      borderColor: '#e5e7eb',
      avatarBackgroundColor: '#f3f4f6',
      userAvatarUrl: undefined,
      botAvatarUrl: undefined,
    },
  }

  const onSend: OnSend = (message) => {
    const question: ChatItem = {
      id: Date.now().toString(),
      content: message,
      isAnswer: false,
    }
    const answer: ChatItem = {
      id: (Date.now() + 1).toString(),
      content: '这是AI的回答...',
      isAnswer: true,
    }
    setChatList([...chatList, question, answer])
  }

  return (
    <div className="h-screen">
      <Chat
        chatList={chatList}
        onSend={onSend}
        themeBuilder={themeBuilder}
        showFileUpload={true}
      />
    </div>
  )
}
```

## 十、测试覆盖

### 10.1 测试文件结构

```
chat/
├── __tests__/
│   ├── index.spec.tsx          # Chat组件测试
│   ├── hooks.spec.tsx          # useChat测试
│   ├── hooks.multimodal.spec.ts # 多模态测试
│   ├── context.spec.tsx        # 上下文测试
│   └── ...
├── answer/
│   └── __tests__/              # Answer组件测试
├── chat-input-area/
│   └── __tests__/              # 输入区域测试
└── ...
```

### 10.2 测试类型

| 测试类型 | 覆盖内容 |
|----------|----------|
| 单元测试 | 工具函数、hooks |
| 组件测试 | UI渲染、交互 |
| 集成测试 | 消息流、状态管理 |
| E2E测试 | 完整对话流程 |

## 十一、最佳实践

### 11.1 消息状态管理

```typescript
// 正确：使用 immer 进行不可变更新
updateChatTreeNode(messageId, (node) => {
  node.content = node.content + message
})

// 错误：直接修改状态
chatList[index].content += message  // ❌
```

### 11.2 SSE 连接管理

```typescript
// 发送前取消旧连接
if (workflowEventsAbortControllerRef.current) {
  workflowEventsAbortControllerRef.current.abort()
}

// 建立新连接
ssePost(url, body, {
  getAbortController: (controller) => {
    workflowEventsAbortControllerRef.current = controller
  },
  // ...
})
```

### 11.3 文件处理

```typescript
// 处理后端返回的文件
const convertedFile: FileEntity = {
  id: file.id,
  type: fileType === 'image' ? 'image/png' : 'application/octet-stream',
  transferMethod: 'remote_url',
  url: file.url,
  // ...
}
```

## 十二、扩展能力

### 12.1 自定义输入组件

**代码示例 (Demo)**:

```typescript
import type { InputForm } from '@/app/components/base/chat/chat/type'

// 定义自定义表单
const inputsForm: InputForm[] = [
  {
    type: 'text',
    label: '姓名',
    variable: 'name',
    required: true,
    hide: false,
    placeholder: '请输入您的姓名',
  },
  {
    type: 'select',
    label: '部门',
    variable: 'department',
    required: true,
    hide: false,
    options: [
      { label: '技术部', value: 'tech' },
      { label: '产品部', value: 'product' },
      { label: '市场部', value: 'marketing' },
    ],
  },
  {
    type: 'textarea',
    label: '备注',
    variable: 'remark',
    required: false,
    hide: false,
    placeholder: '请输入备注信息',
    rows: 3,
  },
]

// 使用自定义表单
const MyCustomFormChat = () => {
  const [inputs, setInputs] = useState<Record<string, any>>({
    name: '',
    department: '',
    remark: '',
  })

  const handleInputChange = (variable: string, value: any) => {
    setInputs(prev => ({ ...prev, [variable]: value }))
  }

  return (
    <Chat
      inputs={inputs}
      inputsForm={inputsForm}
      // ... 其他属性
    />
  )
}
```

### 12.2 自定义消息渲染

**代码示例 (Demo)**:

```tsx
import Chat from '@/app/components/base/chat/chat'
import type { ChatItem, OnSend } from '@/app/components/base/chat/types'

const CustomNode = () => (
  <div className="my-4 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50">
    <div className="flex items-center gap-2">
      <span className="i-ri-lightbulb-line text-yellow-500" />
      <span className="text-sm text-text-secondary">
        💡 提示：您可以通过拖拽文件到输入框上传文件
      </span>
    </div>
  </div>
)

const MyCustomChat = () => {
  const [chatList, setChatList] = useState<ChatItem[]>([])
  
  const onSend: OnSend = (message) => {
    const question: ChatItem = {
      id: Date.now().toString(),
      content: message,
      isAnswer: false,
    }
    const answer: ChatItem = {
      id: (Date.now() + 1).toString(),
      content: '这是AI的回答...',
      isAnswer: true,
    }
    setChatList([...chatList, question, answer])
  }

  return (
    <Chat
      chatList={chatList}
      onSend={onSend}
      chatNode={<CustomNode />}
      // ... 其他属性
    />
  )
}
```

### 12.3 自定义图标

**代码示例 (Demo)**:

```tsx
import Chat from '@/app/components/base/chat/chat'
import { User, Bot } from '@/app/components/base/icons/src/public/avatar'
import type { ChatItem, OnSend } from '@/app/components/base/chat/types'

const MyCustomIconChat = () => {
  const [chatList, setChatList] = useState<ChatItem[]>([])
  
  const onSend: OnSend = (message) => {
    const question: ChatItem = {
      id: Date.now().toString(),
      content: message,
      isAnswer: false,
    }
    const answer: ChatItem = {
      id: (Date.now() + 1).toString(),
      content: '这是AI的回答...',
      isAnswer: true,
    }
    setChatList([...chatList, question, answer])
  }

  return (
    <Chat
      chatList={chatList}
      onSend={onSend}
      questionIcon={
        <div className="h-full w-full rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
          <User className="size-full text-white" />
        </div>
      }
      answerIcon={
        <div className="h-full w-full rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center">
          <Bot className="size-full text-white" />
        </div>
      }
      allToolIcons={{
        'web_search': '🔍',
        'calculator': '🧮',
        'wolfram_alpha': '📐',
        'dataset': '📚',
        'email': '📧',
      }}
    />
  )
}
```

### 12.4 完整集成示例

**代码示例 (Demo)**:

```tsx
import { useState, useCallback } from 'react'
import Chat from '@/app/components/base/chat/chat'
import type { ChatItem, OnSend, ChatConfig } from '@/app/components/base/chat/types'
import { User, Bot } from '@/app/components/base/icons/src/public/avatar'

const CompleteChatIntegration = () => {
  const [chatList, setChatList] = useState<ChatItem[]>([])
  const [isResponding, setIsResponding] = useState(false)

  const config: ChatConfig = {
    supportAnnotation: true,
    questionEditEnable: true,
    supportFeedback: true,
    supportCitationHitInfo: true,
    system_parameters: {
      audio_file_size_limit: 10,
      file_size_limit: 50,
      image_file_size_limit: 10,
      video_file_size_limit: 100,
      workflow_file_upload_limit: 200,
    },
    more_like_this: {
      enabled: true,
    },
  }

  const onSend: OnSend = useCallback(async (message, files) => {
    // 添加用户问题
    const question: ChatItem = {
      id: Date.now().toString(),
      content: message,
      isAnswer: false,
    }
    
    // 添加AI回答占位符
    const answer: ChatItem = {
      id: (Date.now() + 1).toString(),
      content: '',
      isAnswer: true,
    }

    setChatList(prev => [...prev, question, answer])
    setIsResponding(true)

    // 模拟API调用
    setTimeout(() => {
      setChatList(prev => prev.map(item => 
        item.id === answer.id 
          ? { 
              ...item, 
              content: `您问的是: "${message}"\n\n这是AI生成的回答内容，支持Markdown格式。\n\n**功能特性:**\n- 流式响应\n- 工具调用\n- RAG引用\n- 多模态支持`,
            }
          : item
      ))
      setIsResponding(false)
    }, 2000)
  }, [])

  const onFeedback = useCallback((messageId: string, feedback: { rating: string }) => {
    console.log('反馈:', messageId, feedback)
    setChatList(prev => prev.map(item => 
      item.id === messageId 
        ? { ...item, feedback: feedback.rating as any }
        : item
    ))
  }, [])

  return (
    <div className="h-screen bg-gray-50">
      <Chat
        chatList={chatList}
        config={config}
        isResponding={isResponding}
        onSend={onSend}
        onFeedback={onFeedback}
        questionIcon={
          <div className="h-full w-full rounded-full border border-gray-200 bg-white flex items-center justify-center">
            <User className="size-full" />
          </div>
        }
        answerIcon={
          <div className="h-full w-full rounded-full border border-gray-200 bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
            <Bot className="size-full" />
          </div>
        }
        showFileUpload={true}
        showFeatureBar={true}
        sendOnEnter={true}
      />
    </div>
  )
}

export default CompleteChatIntegration
```