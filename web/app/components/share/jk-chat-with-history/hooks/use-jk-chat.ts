import type AudioPlayer from '@/app/components/base/audio-btn/audio'
import type { InputForm, MessageEnd } from '@/app/components/base/chat/chat/type'
import type {
  ChatConfig,
  ChatItem,
  ChatItemInTree,
  Inputs,
} from '@/app/components/base/chat/types'
import type { FileEntity } from '@/app/components/base/file-uploader/types'
import type { Annotation } from '@/models/log'
import type {
  IOnDataMoreInfo,
  IOtherOptions,
} from '@/service/base'
import type { NodeTracing } from '@/types/workflow'
import { toast } from '@langgenius/dify-ui/toast'
import { uniqBy } from 'es-toolkit/compat'
import { noop } from 'es-toolkit/function'
import { produce, setAutoFreeze } from 'immer'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { v4 as uuidV4 } from 'uuid'
import { AudioPlayerManager } from '@/app/components/base/audio-btn/audio.player.manager'
import {
  getProcessedInputs,
  processOpeningStatement,
} from '@/app/components/base/chat/chat/utils'
import { getThreadMessages } from '@/app/components/base/chat/utils'
import {
  getProcessedFiles,
  getProcessedFilesFromResponse,
} from '@/app/components/base/file-uploader/utils'
import { NodeRunningStatus, WorkflowRunningStatus } from '@/app/components/workflow/types'
import useTimestamp from '@/hooks/use-timestamp'
import { useParams, usePathname } from '@/next/navigation'
import {
  sseGet,
  ssePost,
} from '@/service/base'
import { TransferMethod } from '@/types/app'
import {
  checkRunPermission,
  deductSessionRun,
  estimateTokensFromMessageLength,
  INSUFFICIENT_CREDITS_MESSAGE,
} from './use-jk-credits'

type MessageEndMetadata = MessageEnd['metadata'] & {
  usage?: {
    total_tokens?: number
  }
}

const extractUsageTotalTokens = (metadata: unknown): number | undefined => {
  if (!metadata || typeof metadata !== 'object')
    return undefined

  const usage = (metadata as { usage?: Record<string, unknown> }).usage
  if (!usage || typeof usage !== 'object')
    return undefined

  if (typeof usage.total_tokens === 'number' && usage.total_tokens > 0)
    return usage.total_tokens

  if (typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number') {
    const total = usage.prompt_tokens + usage.completion_tokens
    return total > 0 ? total : undefined
  }

  return undefined
}

type ConversationMessageItem = {
  id: string
  answer: string
  query: string
  inputs: Record<string, unknown>
  created_at?: number
  agent_thoughts?: Array<{ thought: string }>
  message?: Array<{ role: string, text?: string, files?: FileEntity[] }>
  message_files?: Array<{ belongs_to?: string } & Partial<FileEntity>>
  message_tokens?: number
  answer_tokens?: number
  provider_response_latency?: number
  metadata?: MessageEndMetadata
}

const getConversationMessageLog = (messageItem: ConversationMessageItem): ChatItem['log'] | undefined => {
  if (!Array.isArray(messageItem.message) || messageItem.message.length === 0)
    return undefined

  const lastMessage = messageItem.message.at(-1)
  const log: NonNullable<ChatItem['log']> = messageItem.message.map(item => ({
    role: item.role,
    text: item.text ?? '',
    ...(item.files ? { files: item.files } : {}),
  }))

  if (lastMessage?.role !== 'assistant') {
    log.push({
      role: 'assistant',
      text: messageItem.answer,
      files: (messageItem.message_files?.filter(
        file => file.belongs_to === 'assistant',
      ) ?? []) as FileEntity[],
    })
  }

  return log
}

const getConversationMessageTotalTokens = (messageItem: ConversationMessageItem): number | undefined => {
  if (typeof messageItem.message_tokens === 'number' && typeof messageItem.answer_tokens === 'number') {
    const total = messageItem.message_tokens + messageItem.answer_tokens
    if (total > 0)
      return total
  }

  return extractUsageTotalTokens(messageItem.metadata)
}

const addRunTokens = (current: number | undefined, tokens?: number): number | undefined => {
  if (typeof tokens !== 'number' || tokens <= 0)
    return current
  return (current ?? 0) + tokens
}

type DeductEstimateContext = {
  query: string
  responseItem: Pick<ChatItem, 'content' | 'agent_thoughts'>
}

const getResponseTextLength = (responseItem: Pick<ChatItem, 'content' | 'agent_thoughts'>): number => {
  if (responseItem.content)
    return responseItem.content.length

  return responseItem.agent_thoughts?.reduce(
    (sum, thought) => sum + (thought.thought?.length ?? 0),
    0,
  ) ?? 0
}

const resolveDeductTokenAmount = (
  totalTokens: number | undefined,
  workflowTokens: number | undefined,
  estimateContext?: DeductEstimateContext,
): number | undefined => {
  if (typeof totalTokens === 'number' && totalTokens > 0)
    return totalTokens
  if (typeof workflowTokens === 'number' && workflowTokens > 0)
    return workflowTokens
  if (!estimateContext)
    return undefined

  const totalLength = estimateContext.query.length + getResponseTextLength(estimateContext.responseItem)
  return estimateTokensFromMessageLength(totalLength)
}

type GetAbortController = (abortController: AbortController) => void
type ConversationMessagesResponse = {
  data: ConversationMessageItem[]
}
type SuggestedQuestionsResponse = {
  data: string[]
}
type HandleSendData = {
  query: string
  files?: FileEntity[]
  parent_message_id?: string
  inputs?: Inputs
  conversation_id?: string | null
  loop_id?: string
}
type SendCallback = {
  onGetConversationMessages?: (conversationId: string, getAbortController: GetAbortController) => Promise<ConversationMessagesResponse>
  onGetSuggestedQuestions?: (responseItemId: string, getAbortController: GetAbortController) => Promise<SuggestedQuestionsResponse>
  onConversationComplete?: (conversationId: string) => void
  isPublicAPI?: boolean
}

export const useJkChat = (
  config?: ChatConfig,
  formSettings?: {
    inputs: Inputs
    inputsForm: InputForm[]
  },
  prevChatTree?: ChatItemInTree[],
  stopChat?: (taskId: string) => void,
  clearChatList?: boolean,
  clearChatListCallback?: (state: boolean) => void,
) => {
  const { t } = useTranslation()
  const { formatTime } = useTimestamp()
  const conversationIdRef = useRef('')
  const hasStopRespondedRef = useRef(false)
  const [isResponding, setIsResponding] = useState(false)
  const isRespondingRef = useRef(false)
  const taskIdRef = useRef('')
  const runTotalTokensRef = useRef<number | undefined>(undefined)
  const pausedStateRef = useRef(false)
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([])
  const conversationMessagesAbortControllerRef = useRef<AbortController | null>(null)
  const suggestedQuestionsAbortControllerRef = useRef<AbortController | null>(null)
  const workflowEventsAbortControllerRef = useRef<AbortController | null>(null)
  const params = useParams()
  const pathname = usePathname()
  const deductedMessageIdsRef = useRef(new Set<string>())

  const tryDeductMessage = useCallback((
    totalTokens: number | undefined,
    messageId: string | undefined,
    taskId: string | undefined,
    estimateContext?: DeductEstimateContext,
  ) => {
    const bizId = messageId && !messageId.startsWith('answer-placeholder') ? messageId : taskId
    if (!bizId)
      return
    if (deductedMessageIdsRef.current.has(bizId))
      return

    const amount = resolveDeductTokenAmount(
      totalTokens,
      runTotalTokensRef.current,
      estimateContext,
    )
    if (!amount || amount <= 0)
      return

    deductedMessageIdsRef.current.add(bizId)
    deductSessionRun(amount, bizId)
  }, [])

  const [chatTree, setChatTree] = useState<ChatItemInTree[]>(prevChatTree || [])
  const chatTreeRef = useRef<ChatItemInTree[]>(chatTree)
  const [targetMessageId, setTargetMessageId] = useState<string>()
  const threadMessages = useMemo(() => getThreadMessages(chatTree, targetMessageId), [chatTree, targetMessageId])

  const getIntroduction = useCallback((str: string) => {
    return processOpeningStatement(str, formSettings?.inputs || {}, formSettings?.inputsForm || [])
  }, [formSettings?.inputs, formSettings?.inputsForm])

  const processedOpeningContent = config?.opening_statement
    ? getIntroduction(config.opening_statement)
    : undefined
  const processedSuggestionsKey = config?.suggested_questions
    ? JSON.stringify(config.suggested_questions.map(q => getIntroduction(q)))
    : undefined

  const openingStatementItem = useMemo<ChatItemInTree | null>(() => {
    if (!processedOpeningContent)
      return null
    return {
      id: 'opening-statement',
      content: processedOpeningContent,
      isAnswer: true,
      isOpeningStatement: true,
      suggestedQuestions: processedSuggestionsKey
        ? JSON.parse(processedSuggestionsKey) as string[]
        : undefined,
    }
  }, [processedOpeningContent, processedSuggestionsKey])

  const threadOpener = useMemo(
    () => threadMessages.find(item => item.isOpeningStatement) ?? null,
    [threadMessages],
  )

  const mergedOpeningItem = useMemo<ChatItemInTree | null>(() => {
    if (!threadOpener || !openingStatementItem)
      return null
    return {
      ...threadOpener,
      content: openingStatementItem.content,
      suggestedQuestions: openingStatementItem.suggestedQuestions,
    }
  }, [threadOpener, openingStatementItem])

  /** Final chat list that will be rendered */
  const chatList = useMemo(() => {
    const ret = [...threadMessages]
    if (openingStatementItem) {
      const index = threadMessages.findIndex(item => item.isOpeningStatement)
      if (index > -1 && mergedOpeningItem)
        ret[index] = mergedOpeningItem
      else if (index === -1)
        ret.unshift(openingStatementItem)
    }
    return ret
  }, [threadMessages, openingStatementItem, mergedOpeningItem])

  useEffect(() => {
    setAutoFreeze(false)
    return () => {
      setAutoFreeze(true)
    }
  }, [])

  /** Find the target node by bfs and then operate on it */
  const produceChatTreeNode = useCallback((targetId: string, operation: (node: ChatItemInTree) => void) => {
    return produce(chatTreeRef.current, (draft) => {
      const queue: ChatItemInTree[] = [...draft]
      while (queue.length > 0) {
        const current = queue.shift()!
        if (current.id === targetId) {
          operation(current)
          break
        }
        if (current.children)
          queue.push(...current.children)
      }
    })
  }, [])

  type UpdateChatTreeNode = {
    (id: string, fields: Partial<ChatItemInTree>): void
    (id: string, update: (node: ChatItemInTree) => void): void
  }

  const updateChatTreeNode: UpdateChatTreeNode = useCallback((
    id: string,
    fieldsOrUpdate: Partial<ChatItemInTree> | ((node: ChatItemInTree) => void),
  ) => {
    const nextState = produceChatTreeNode(id, (node) => {
      if (typeof fieldsOrUpdate === 'function') {
        fieldsOrUpdate(node)
      }
      else {
        Object.assign(node, fieldsOrUpdate)
      }
    })
    setChatTree(nextState)
    chatTreeRef.current = nextState
  }, [produceChatTreeNode])

  const handleResponding = useCallback((isResponding: boolean) => {
    setIsResponding(isResponding)
    isRespondingRef.current = isResponding
  }, [])

  const handleStop = useCallback(() => {
    hasStopRespondedRef.current = true
    handleResponding(false)
    if (stopChat && taskIdRef.current && !pausedStateRef.current)
      stopChat(taskIdRef.current)
    if (conversationMessagesAbortControllerRef.current)
      conversationMessagesAbortControllerRef.current.abort()
    if (suggestedQuestionsAbortControllerRef.current)
      suggestedQuestionsAbortControllerRef.current.abort()
    if (workflowEventsAbortControllerRef.current)
      workflowEventsAbortControllerRef.current.abort()
  }, [stopChat, handleResponding])

  const resetChatTreeState = useCallback(() => {
    setChatTree([])
    setSuggestedQuestions([])
  }, [])

  const handleRestart = useCallback((cb?: () => void) => {
    conversationIdRef.current = ''
    taskIdRef.current = ''
    handleStop()
    resetChatTreeState()
    cb?.()
  }, [handleStop, resetChatTreeState])

  const createAudioPlayerManager = useCallback(() => {
    let ttsUrl = ''
    let ttsIsPublic = false
    if (params.token) {
      ttsUrl = '/text-to-audio'
      ttsIsPublic = true
    }
    else if (params.appId) {
      if (pathname.search('explore/installed') > -1)
        ttsUrl = `/installed-apps/${params.appId}/text-to-audio`
      else
        ttsUrl = `/apps/${params.appId}/text-to-audio`
    }

    let player: AudioPlayer | null = null
    const getOrCreatePlayer = () => {
      if (!player)
        player = AudioPlayerManager.getInstance().getAudioPlayer(ttsUrl, ttsIsPublic, uuidV4(), 'none', 'none', noop)

      return player
    }

    return getOrCreatePlayer
  }, [params.token, params.appId, pathname])

  const handleResume = useCallback(async (
    messageId: string,
    workflowRunId: string,
    {
      onGetSuggestedQuestions,
      onConversationComplete,
      isPublicAPI,
    }: SendCallback,
  ) => {
    const getOrCreatePlayer = createAudioPlayerManager()
    // Re-subscribe to workflow events for the specific message
    const url = `/workflow/${workflowRunId}/events?include_state_snapshot=true`

    const otherOptions: IOtherOptions = {
      isPublicAPI,
      getAbortController: (abortController) => {
        workflowEventsAbortControllerRef.current = abortController
      },
      onData: (message: string, isFirstMessage: boolean, { conversationId: newConversationId, messageId, taskId }: IOnDataMoreInfo) => {
        updateChatTreeNode(messageId, (responseItem) => {
          const isAgentMode = responseItem.agent_thoughts && responseItem.agent_thoughts.length > 0
          if (!isAgentMode) {
            responseItem.content = responseItem.content + message
          }
          else {
            const lastThought = responseItem.agent_thoughts?.[responseItem.agent_thoughts?.length - 1]
            if (lastThought)
              lastThought.thought = lastThought.thought + message
          }
          if (messageId)
            responseItem.id = messageId
        })

        if (isFirstMessage && newConversationId)
          conversationIdRef.current = newConversationId

        if (taskId)
          taskIdRef.current = taskId
      },
      async onCompleted(hasError?: boolean) {
        handleResponding(false)

        if (hasError)
          return

        if (onConversationComplete)
          onConversationComplete(conversationIdRef.current)

        if (config?.suggested_questions_after_answer?.enabled && !hasStopRespondedRef.current && onGetSuggestedQuestions) {
          try {
            const { data } = await onGetSuggestedQuestions(
              messageId,
              newAbortController => suggestedQuestionsAbortControllerRef.current = newAbortController,
            )
            setSuggestedQuestions(data)
          }
          // eslint-disable-next-line unused-imports/no-unused-vars
          catch (e) {
            setSuggestedQuestions([])
          }
        }
      },
      onFile(file) {
        // Convert simple file type to MIME type for non-agent mode
        // Backend sends: { id, type: "image", belongs_to, url }
        // Frontend expects: { id, type: "image/png", transferMethod, url, uploadedId, supportFileType, name, size }

        // Determine file type for MIME conversion
        const fileType = (file as { type?: string }).type || 'image'

        // If file already has transferMethod, use it as base and ensure all required fields exist
        // Otherwise, create a new complete file object
        const baseFile = ('transferMethod' in file) ? (file as Partial<FileEntity>) : null

        const convertedFile: FileEntity = {
          id: baseFile?.id || (file as { id: string }).id,
          type: baseFile?.type || (fileType === 'image' ? 'image/png' : fileType === 'video' ? 'video/mp4' : fileType === 'audio' ? 'audio/mpeg' : 'application/octet-stream'),
          transferMethod: (baseFile?.transferMethod as FileEntity['transferMethod']) || (fileType === 'image' ? 'remote_url' : 'local_file'),
          uploadedId: baseFile?.uploadedId || (file as { id: string }).id,
          supportFileType: baseFile?.supportFileType || (fileType === 'image' ? 'image' : fileType === 'video' ? 'video' : fileType === 'audio' ? 'audio' : 'document'),
          progress: baseFile?.progress ?? 100,
          name: baseFile?.name || `generated_${fileType}.${fileType === 'image' ? 'png' : fileType === 'video' ? 'mp4' : fileType === 'audio' ? 'mp3' : 'bin'}`,
          url: baseFile?.url || (file as { url?: string }).url,
          size: baseFile?.size ?? 0, // Generated files don't have a known size
        }
        updateChatTreeNode(messageId, (responseItem) => {
          const lastThought = responseItem.agent_thoughts?.[responseItem.agent_thoughts?.length - 1]
          if (lastThought) {
            responseItem.agent_thoughts!.at(-1)!.message_files = [...(lastThought.message_files ?? []), convertedFile]
          }
          else {
            const currentFiles = (responseItem.message_files as FileEntity[] | undefined) ?? []
            responseItem.message_files = [...currentFiles, convertedFile]
          }
        })
      },
      onThought(thought) {
        updateChatTreeNode(messageId, (responseItem) => {
          if (thought.message_id)
            responseItem.id = thought.message_id
          if (thought.conversation_id)
            responseItem.conversationId = thought.conversation_id

          if (!responseItem.agent_thoughts)
            responseItem.agent_thoughts = []

          if (responseItem.agent_thoughts.length === 0) {
            responseItem.agent_thoughts.push(thought)
          }
          else {
            const lastThought = responseItem.agent_thoughts.at(-1)
            if (lastThought?.id === thought.id) {
              thought.thought = lastThought.thought
              thought.message_files = lastThought.message_files
              responseItem.agent_thoughts[responseItem.agent_thoughts.length - 1] = thought
            }
            else {
              responseItem.agent_thoughts.push(thought)
            }
          }
        })
      },
      onMessageEnd: (messageEnd) => {
        updateChatTreeNode(messageId, (responseItem) => {
          if (messageEnd.metadata?.annotation_reply) {
            responseItem.annotation = ({
              id: messageEnd.metadata.annotation_reply.id,
              authorName: messageEnd.metadata.annotation_reply.account.name,
            })
            return
          }
          responseItem.citation = messageEnd.metadata?.retriever_resources || []
          const processedFilesFromResponse = getProcessedFilesFromResponse(messageEnd.files || [])
          responseItem.allFiles = uniqBy([...(responseItem.allFiles || []), ...(processedFilesFromResponse || [])], 'id')
        })
      },
      onMessageReplace: (messageReplace) => {
        updateChatTreeNode(messageId, (responseItem) => {
          responseItem.content = messageReplace.answer
        })
      },
      onError() {
        handleResponding(false)
      },
      onWorkflowStarted: ({ workflow_run_id, task_id }) => {
        handleResponding(true)
        hasStopRespondedRef.current = false
        updateChatTreeNode(messageId, (responseItem) => {
          if (responseItem.workflowProcess && responseItem.workflowProcess.tracing.length > 0) {
            responseItem.workflowProcess.status = WorkflowRunningStatus.Running
          }
          else {
            taskIdRef.current = task_id
            responseItem.workflow_run_id = workflow_run_id
            responseItem.workflowProcess = {
              status: WorkflowRunningStatus.Running,
              tracing: [],
            }
          }
        })
      },
      onWorkflowFinished: ({ data: workflowFinishedData }) => {
        updateChatTreeNode(messageId, (responseItem) => {
          if (responseItem.workflowProcess)
            responseItem.workflowProcess.status = workflowFinishedData.status as WorkflowRunningStatus
        })
        runTotalTokensRef.current = addRunTokens(runTotalTokensRef.current, workflowFinishedData.total_tokens)
        if (workflowFinishedData.total_tokens > 0) {
          tryDeductMessage(
            workflowFinishedData.total_tokens,
            messageId,
            taskIdRef.current,
          )
        }
      },
      onIterationStart: ({ data: iterationStartedData }) => {
        updateChatTreeNode(messageId, (responseItem) => {
          if (!responseItem.workflowProcess)
            return
          if (!responseItem.workflowProcess.tracing)
            responseItem.workflowProcess.tracing = []
          responseItem.workflowProcess.tracing.push({
            ...iterationStartedData,
            status: WorkflowRunningStatus.Running,
          })
        })
      },
      onIterationFinish: ({ data: iterationFinishedData }) => {
        updateChatTreeNode(messageId, (responseItem) => {
          if (!responseItem.workflowProcess?.tracing)
            return
          const tracing = responseItem.workflowProcess.tracing
          const iterationIndex = tracing.findIndex(item => item.node_id === iterationFinishedData.node_id
            && (item.execution_metadata?.parallel_id === iterationFinishedData.execution_metadata?.parallel_id || item.parallel_id === iterationFinishedData.execution_metadata?.parallel_id))!
          if (iterationIndex > -1) {
            tracing[iterationIndex] = {
              ...tracing[iterationIndex],
              ...iterationFinishedData,
              status: WorkflowRunningStatus.Succeeded,
            }
          }
        })
      },
      onNodeStarted: ({ data: nodeStartedData }) => {
        updateChatTreeNode(messageId, (responseItem) => {
          if (!responseItem.workflowProcess)
            return
          if (!responseItem.workflowProcess.tracing)
            responseItem.workflowProcess.tracing = []

          const currentIndex = responseItem.workflowProcess.tracing.findIndex(item => item.node_id === nodeStartedData.node_id)
          // if the node is already started, update the node
          if (currentIndex > -1) {
            responseItem.workflowProcess.tracing[currentIndex] = {
              ...nodeStartedData,
              status: NodeRunningStatus.Running,
            }
          }
          else {
            if (nodeStartedData.iteration_id)
              return

            responseItem.workflowProcess.tracing.push({
              ...nodeStartedData,
              status: WorkflowRunningStatus.Running,
            })
          }
        })
      },
      onNodeFinished: ({ data: nodeFinishedData }) => {
        updateChatTreeNode(messageId, (responseItem) => {
          if (!responseItem.workflowProcess?.tracing)
            return

          if (nodeFinishedData.iteration_id)
            return

          const currentIndex = responseItem.workflowProcess.tracing.findIndex((item) => {
            if (!item.execution_metadata?.parallel_id)
              return item.id === nodeFinishedData.id

            return item.id === nodeFinishedData.id && (item.execution_metadata?.parallel_id === nodeFinishedData.execution_metadata?.parallel_id)
          })
          if (currentIndex > -1)
            responseItem.workflowProcess.tracing[currentIndex] = nodeFinishedData as NodeTracing
        })
        runTotalTokensRef.current = addRunTokens(
          runTotalTokensRef.current,
          nodeFinishedData.execution_metadata?.total_tokens,
        )
      },
      onTTSChunk: (messageId: string, audio: string) => {
        if (!audio || audio === '')
          return
        const audioPlayer = getOrCreatePlayer()
        if (audioPlayer) {
          audioPlayer.playAudioWithAudio(audio, true)
          AudioPlayerManager.getInstance().resetMsgId(messageId)
        }
      },
      onTTSEnd: (messageId: string, audio: string) => {
        const audioPlayer = getOrCreatePlayer()
        if (audioPlayer)
          audioPlayer.playAudioWithAudio(audio, false)
      },
      onLoopStart: ({ data: loopStartedData }) => {
        updateChatTreeNode(messageId, (responseItem) => {
          if (!responseItem.workflowProcess)
            return
          if (!responseItem.workflowProcess.tracing)
            responseItem.workflowProcess.tracing = []
          responseItem.workflowProcess.tracing.push({
            ...loopStartedData,
            status: WorkflowRunningStatus.Running,
          })
        })
      },
      onLoopFinish: ({ data: loopFinishedData }) => {
        updateChatTreeNode(messageId, (responseItem) => {
          if (!responseItem.workflowProcess?.tracing)
            return
          const tracing = responseItem.workflowProcess.tracing
          const loopIndex = tracing.findIndex(item => item.node_id === loopFinishedData.node_id
            && (item.execution_metadata?.parallel_id === loopFinishedData.execution_metadata?.parallel_id || item.parallel_id === loopFinishedData.execution_metadata?.parallel_id))!
          if (loopIndex > -1) {
            tracing[loopIndex] = {
              ...tracing[loopIndex],
              ...loopFinishedData,
              status: WorkflowRunningStatus.Succeeded,
            }
          }
        })
      },
      onHumanInputRequired: ({ data: humanInputRequiredData }) => {
        updateChatTreeNode(messageId, (responseItem) => {
          if (!responseItem.humanInputFormDataList) {
            responseItem.humanInputFormDataList = [humanInputRequiredData]
          }
          else {
            const currentFormIndex = responseItem.humanInputFormDataList.findIndex(item => item.node_id === humanInputRequiredData.node_id)
            if (currentFormIndex > -1) {
              responseItem.humanInputFormDataList[currentFormIndex] = humanInputRequiredData
            }
            else {
              responseItem.humanInputFormDataList.push(humanInputRequiredData)
            }
          }
          if (responseItem.workflowProcess?.tracing) {
            const currentTracingIndex = responseItem.workflowProcess.tracing.findIndex(item => item.node_id === humanInputRequiredData.node_id)
            if (currentTracingIndex > -1)
              responseItem.workflowProcess.tracing[currentTracingIndex]!.status = NodeRunningStatus.Paused
          }
        })
      },
      onHumanInputFormFilled: ({ data: humanInputFilledFormData }) => {
        updateChatTreeNode(messageId, (responseItem) => {
          if (responseItem.humanInputFormDataList?.length) {
            const currentFormIndex = responseItem.humanInputFormDataList.findIndex(item => item.node_id === humanInputFilledFormData.node_id)
            if (currentFormIndex > -1)
              responseItem.humanInputFormDataList.splice(currentFormIndex, 1)
          }
          if (!responseItem.humanInputFilledFormDataList) {
            responseItem.humanInputFilledFormDataList = [humanInputFilledFormData]
          }
          else {
            responseItem.humanInputFilledFormDataList.push(humanInputFilledFormData)
          }
        })
      },
      onHumanInputFormTimeout: ({ data: humanInputFormTimeoutData }) => {
        updateChatTreeNode(messageId, (responseItem) => {
          if (responseItem.humanInputFormDataList?.length) {
            const currentFormIndex = responseItem.humanInputFormDataList.findIndex(item => item.node_id === humanInputFormTimeoutData.node_id)
            responseItem.humanInputFormDataList[currentFormIndex]!.expiration_time = humanInputFormTimeoutData.expiration_time
          }
        })
      },
      onWorkflowPaused: ({ data: workflowPausedData }) => {
        const resumeUrl = `/workflow/${workflowPausedData.workflow_run_id}/events`
        pausedStateRef.current = true
        sseGet(
          resumeUrl,
          {},
          otherOptions,
        )
        updateChatTreeNode(messageId, (responseItem) => {
          responseItem.workflowProcess!.status = WorkflowRunningStatus.Paused
        })
      },
    }

    if (workflowEventsAbortControllerRef.current)
      workflowEventsAbortControllerRef.current.abort()

    sseGet(
      url,
      {},
      otherOptions,
    )
  }, [updateChatTreeNode, handleResponding, createAudioPlayerManager, config?.suggested_questions_after_answer, tryDeductMessage])

  const updateCurrentQAOnTree = useCallback(({
    parentId,
    responseItem,
    placeholderQuestionId,
    questionItem,
  }: {
    parentId?: string
    responseItem: ChatItem
    placeholderQuestionId: string
    questionItem: ChatItem
  }) => {
    let nextState: ChatItemInTree[]
    const currentQA = { ...questionItem, children: [{ ...responseItem, children: [] }] }
    if (!parentId && !chatTree.some(item => [placeholderQuestionId, questionItem.id].includes(item.id))) {
      // QA whose parent is not provided is considered as a first message of the conversation,
      // and it should be a root node of the chat tree
      nextState = produce(chatTree, (draft) => {
        draft.push(currentQA)
      })
    }
    else {
      // find the target QA in the tree and update it; if not found, insert it to its parent node
      nextState = produceChatTreeNode(parentId!, (parentNode) => {
        const questionNodeIndex = parentNode.children!.findIndex(item => [placeholderQuestionId, questionItem.id].includes(item.id))
        if (questionNodeIndex === -1)
          parentNode.children!.push(currentQA)
        else
          parentNode.children![questionNodeIndex] = currentQA
      })
    }
    setChatTree(nextState)
    chatTreeRef.current = nextState
  }, [chatTree, produceChatTreeNode])

  const handleSend = useCallback(async (
    url: string,
    data: HandleSendData,
    {
      onGetConversationMessages,
      onGetSuggestedQuestions,
      onConversationComplete,
      isPublicAPI,
    }: SendCallback,
  ) => {
    setSuggestedQuestions([])

    if (isRespondingRef.current) {
      toast.info(t('errorMessage.waitForResponse', { ns: 'appDebug' }))
      return false
    }

    const hasPermission = await checkRunPermission()
    if (!hasPermission) {
      toast.error(INSUFFICIENT_CREDITS_MESSAGE)
      return false
    }

    const parentMessage = threadMessages.find(item => item.id === data.parent_message_id)

    const placeholderQuestionId = `question-${Date.now()}`
    const questionItem = {
      id: placeholderQuestionId,
      content: data.query,
      isAnswer: false,
      message_files: data.files,
      parentMessageId: data.parent_message_id,
    }

    const placeholderAnswerId = `answer-placeholder-${Date.now()}`
    const placeholderAnswerItem = {
      id: placeholderAnswerId,
      content: '',
      isAnswer: true,
      parentMessageId: questionItem.id,
      siblingIndex: parentMessage?.children?.length ?? chatTree.length,
    }

    setTargetMessageId(parentMessage?.id)
    updateCurrentQAOnTree({
      parentId: data.parent_message_id,
      responseItem: placeholderAnswerItem,
      placeholderQuestionId,
      questionItem,
    })

    // answer
    const responseItem: ChatItemInTree = {
      id: placeholderAnswerId,
      content: '',
      agent_thoughts: [],
      message_files: [],
      isAnswer: true,
      parentMessageId: questionItem.id,
      siblingIndex: parentMessage?.children?.length ?? chatTree.length,
    }

    handleResponding(true)
    hasStopRespondedRef.current = false
    runTotalTokensRef.current = undefined

    const { query, files, inputs, ...restData } = data
    const bodyParams = {
      response_mode: 'streaming',
      conversation_id: conversationIdRef.current,
      files: getProcessedFiles(files || []),
      query,
      inputs: getProcessedInputs(inputs || {}, formSettings?.inputsForm || []),
      ...restData,
    }
    if (bodyParams?.files?.length) {
      bodyParams.files = bodyParams.files.map((item) => {
        if (item.transfer_method === TransferMethod.local_file) {
          return {
            ...item,
            url: '',
          }
        }
        return item
      })
    }

    let isAgentMode = false
    let hasSetResponseId = false

    const getOrCreatePlayer = createAudioPlayerManager()

    const otherOptions: IOtherOptions = {
      isPublicAPI,
      getAbortController: (abortController) => {
        workflowEventsAbortControllerRef.current = abortController
      },
      onData: (message: string, isFirstMessage: boolean, { conversationId: newConversationId, messageId, taskId }: IOnDataMoreInfo) => {
        if (!isAgentMode) {
          responseItem.content = responseItem.content + message
        }
        else {
          const lastThought = responseItem.agent_thoughts?.[responseItem.agent_thoughts?.length - 1]
          if (lastThought)
            lastThought.thought = lastThought.thought + message // need immer setAutoFreeze
        }

        if (messageId && !hasSetResponseId) {
          questionItem.id = `question-${messageId}`
          responseItem.id = messageId
          responseItem.parentMessageId = questionItem.id
          hasSetResponseId = true
        }

        if (isFirstMessage && newConversationId)
          conversationIdRef.current = newConversationId

        taskIdRef.current = taskId
        if (messageId)
          responseItem.id = messageId

        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      async onCompleted(hasError?: boolean) {
        handleResponding(false)

        if (hasError)
          return

        if (onConversationComplete)
          onConversationComplete(conversationIdRef.current)

        if (conversationIdRef.current && !hasStopRespondedRef.current && onGetConversationMessages) {
          const { data } = await onGetConversationMessages(
            conversationIdRef.current,
            newAbortController => conversationMessagesAbortControllerRef.current = newAbortController,
          )
          const newResponseItem = data.find((item: ConversationMessageItem) => item.id === responseItem.id)
          if (newResponseItem) {
            const isUseAgentThought = newResponseItem.agent_thoughts?.length > 0 && newResponseItem.agent_thoughts[newResponseItem.agent_thoughts?.length - 1]?.thought === newResponseItem.answer
            const messageLog = getConversationMessageLog(newResponseItem)
            const totalTokens = getConversationMessageTotalTokens(newResponseItem)
            if (typeof newResponseItem.provider_response_latency === 'number' && typeof totalTokens === 'number') {
              updateChatTreeNode(responseItem.id, (node) => {
                node.content = isUseAgentThought ? '' : newResponseItem.answer
                if (messageLog)
                  node.log = messageLog
                node.more = {
                  time: formatTime(newResponseItem.created_at, 'hh:mm A'),
                  tokens: totalTokens,
                  latency: newResponseItem.provider_response_latency.toFixed(2),
                  tokens_per_second: newResponseItem.provider_response_latency > 0 && typeof newResponseItem.answer_tokens === 'number'
                    ? (newResponseItem.answer_tokens / newResponseItem.provider_response_latency).toFixed(2)
                    : undefined,
                }
                node.conversationId = conversationIdRef.current
                node.input = {
                  inputs: newResponseItem.inputs,
                  query: newResponseItem.query,
                }
              })
            }
            else {
              updateChatTreeNode(responseItem.id, (node) => {
                node.content = isUseAgentThought ? '' : newResponseItem.answer
                if (messageLog)
                  node.log = messageLog
                node.conversationId = conversationIdRef.current
                node.input = {
                  inputs: newResponseItem.inputs,
                  query: newResponseItem.query,
                }
              })
            }
          }
        }

        if (!hasStopRespondedRef.current) {
          const hasRealMessageId = responseItem.id && !responseItem.id.startsWith('answer-placeholder')
          tryDeductMessage(
            undefined,
            hasRealMessageId ? responseItem.id : undefined,
            taskIdRef.current,
            { query, responseItem },
          )
          runTotalTokensRef.current = undefined
        }
        if (config?.suggested_questions_after_answer?.enabled && !hasStopRespondedRef.current && onGetSuggestedQuestions) {
          try {
            const { data } = await onGetSuggestedQuestions(
              responseItem.id,
              newAbortController => suggestedQuestionsAbortControllerRef.current = newAbortController,
            )
            setSuggestedQuestions(data)
          }
          // eslint-disable-next-line unused-imports/no-unused-vars
          catch (e) {
            setSuggestedQuestions([])
          }
        }
      },
      onFile(file) {
        // Convert simple file type to MIME type for non-agent mode
        // Backend sends: { id, type: "image", belongs_to, url }
        // Frontend expects: { id, type: "image/png", transferMethod, url, uploadedId, supportFileType, name, size }

        // Determine file type for MIME conversion
        const fileType = (file as { type?: string }).type || 'image'

        // If file already has transferMethod, use it as base and ensure all required fields exist
        // Otherwise, create a new complete file object
        const baseFile = ('transferMethod' in file) ? (file as Partial<FileEntity>) : null

        const convertedFile: FileEntity = {
          id: baseFile?.id || (file as { id: string }).id,
          type: baseFile?.type || (fileType === 'image' ? 'image/png' : fileType === 'video' ? 'video/mp4' : fileType === 'audio' ? 'audio/mpeg' : 'application/octet-stream'),
          transferMethod: (baseFile?.transferMethod as FileEntity['transferMethod']) || (fileType === 'image' ? 'remote_url' : 'local_file'),
          uploadedId: baseFile?.uploadedId || (file as { id: string }).id,
          supportFileType: baseFile?.supportFileType || (fileType === 'image' ? 'image' : fileType === 'video' ? 'video' : fileType === 'audio' ? 'audio' : 'document'),
          progress: baseFile?.progress ?? 100,
          name: baseFile?.name || `generated_${fileType}.${fileType === 'image' ? 'png' : fileType === 'video' ? 'mp4' : fileType === 'audio' ? 'mp3' : 'bin'}`,
          url: baseFile?.url || (file as { url?: string }).url,
          size: baseFile?.size ?? 0, // Generated files don't have a known size
        }

        // For agent mode, add files to the last thought
        const lastThought = responseItem.agent_thoughts?.[responseItem.agent_thoughts?.length - 1]
        if (lastThought) {
          const thought = lastThought as { message_files?: FileEntity[] }
          responseItem.agent_thoughts!.at(-1)!.message_files = [...(thought.message_files ?? []), convertedFile]
        }
        // For non-agent mode, add files directly to responseItem.message_files
        else {
          const currentFiles = (responseItem.message_files as FileEntity[] | undefined) ?? []
          responseItem.message_files = [...currentFiles, convertedFile]
        }

        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      onThought(thought) {
        isAgentMode = true
        if (thought.message_id && !hasSetResponseId)
          responseItem.id = thought.message_id
        if (thought.conversation_id)
          responseItem.conversationId = thought.conversation_id

        const agentThoughts = responseItem.agent_thoughts!
        if (agentThoughts.length === 0) {
          agentThoughts.push(thought)
        }
        else {
          const lastThought = agentThoughts.at(-1)!
          // thought changed but still the same thought, so update.
          if (lastThought.id === thought.id) {
            thought.thought = lastThought.thought
            thought.message_files = lastThought.message_files
            agentThoughts[agentThoughts.length - 1] = thought
          }
          else {
            agentThoughts.push(thought)
          }
        }
        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      onMessageEnd: (messageEnd) => {
        if (messageEnd.metadata?.annotation_reply) {
          responseItem.id = messageEnd.id
          responseItem.annotation = ({
            id: messageEnd.metadata.annotation_reply.id,
            authorName: messageEnd.metadata.annotation_reply.account.name,
          })
          updateCurrentQAOnTree({
            placeholderQuestionId,
            questionItem,
            responseItem,
            parentId: data.parent_message_id,
          })
          handleResponding(false)
          return
        }
        responseItem.citation = messageEnd.metadata?.retriever_resources || []
        const processedFilesFromResponse = getProcessedFilesFromResponse(messageEnd.files || [])
        responseItem.allFiles = uniqBy([...(responseItem.allFiles || []), ...(processedFilesFromResponse || [])], 'id')

        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      onMessageReplace: (messageReplace) => {
        responseItem.content = messageReplace.answer
      },
      onError() {
        handleResponding(false)
        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      onWorkflowStarted: ({ workflow_run_id, task_id, conversation_id, message_id }) => {
        // If there are no streaming messages, we still need to set the conversation_id to avoid create a new conversation when regeneration in chat-flow.
        if (conversation_id) {
          conversationIdRef.current = conversation_id
        }
        if (message_id && !hasSetResponseId) {
          questionItem.id = `question-${message_id}`
          responseItem.id = message_id
          responseItem.parentMessageId = questionItem.id
          hasSetResponseId = true
        }

        if (responseItem.workflowProcess && responseItem.workflowProcess.tracing.length > 0) {
          responseItem.workflowProcess.status = WorkflowRunningStatus.Running
        }
        else {
          taskIdRef.current = task_id
          responseItem.workflow_run_id = workflow_run_id
          responseItem.workflowProcess = {
            status: WorkflowRunningStatus.Running,
            tracing: [],
          }
        }
        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      onWorkflowFinished: ({ data: workflowFinishedData }) => {
        if (pausedStateRef.current)
          pausedStateRef.current = false
        responseItem.workflowProcess!.status = workflowFinishedData.status as WorkflowRunningStatus
        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
        runTotalTokensRef.current = addRunTokens(runTotalTokensRef.current, workflowFinishedData.total_tokens)
        if (workflowFinishedData.total_tokens > 0) {
          tryDeductMessage(
            workflowFinishedData.total_tokens,
            responseItem.id,
            taskIdRef.current,
          )
        }
      },
      onIterationStart: ({ data: iterationStartedData }) => {
        responseItem.workflowProcess!.tracing!.push({
          ...iterationStartedData,
          status: WorkflowRunningStatus.Running,
        })
        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      onIterationFinish: ({ data: iterationFinishedData }) => {
        const tracing = responseItem.workflowProcess!.tracing!
        const iterationIndex = tracing.findIndex(item => item.node_id === iterationFinishedData.node_id
          && (item.execution_metadata?.parallel_id === iterationFinishedData.execution_metadata?.parallel_id || item.parallel_id === iterationFinishedData.execution_metadata?.parallel_id))!
        tracing[iterationIndex] = {
          ...tracing[iterationIndex],
          ...iterationFinishedData,
          status: WorkflowRunningStatus.Succeeded,
        }

        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      onNodeStarted: ({ data: nodeStartedData }) => {
        if (!responseItem.workflowProcess)
          return
        if (!responseItem.workflowProcess.tracing)
          responseItem.workflowProcess.tracing = []

        const currentIndex = responseItem.workflowProcess.tracing.findIndex(item => item.node_id === nodeStartedData.node_id)
        if (currentIndex > -1) {
          responseItem.workflowProcess.tracing[currentIndex] = {
            ...nodeStartedData,
            status: NodeRunningStatus.Running,
          }
        }
        else {
          if (nodeStartedData.iteration_id)
            return

          if (data.loop_id)
            return

          responseItem.workflowProcess.tracing.push({
            ...nodeStartedData,
            status: WorkflowRunningStatus.Running,
          })
        }
        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      onNodeFinished: ({ data: nodeFinishedData }) => {
        if (nodeFinishedData.iteration_id)
          return

        if (data.loop_id)
          return

        const currentIndex = responseItem.workflowProcess!.tracing!.findIndex((item) => {
          if (!item.execution_metadata?.parallel_id)
            return item.id === nodeFinishedData.id

          return item.id === nodeFinishedData.id && (item.execution_metadata?.parallel_id === nodeFinishedData.execution_metadata?.parallel_id)
        })
        responseItem.workflowProcess!.tracing[currentIndex] = nodeFinishedData as NodeTracing

        runTotalTokensRef.current = addRunTokens(
          runTotalTokensRef.current,
          nodeFinishedData.execution_metadata?.total_tokens,
        )

        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      onTTSChunk: (messageId: string, audio: string) => {
        if (!audio || audio === '')
          return
        const audioPlayer = getOrCreatePlayer()
        if (audioPlayer) {
          audioPlayer.playAudioWithAudio(audio, true)
          AudioPlayerManager.getInstance().resetMsgId(messageId)
        }
      },
      onTTSEnd: (messageId: string, audio: string) => {
        const audioPlayer = getOrCreatePlayer()
        if (audioPlayer)
          audioPlayer.playAudioWithAudio(audio, false)
      },
      onLoopStart: ({ data: loopStartedData }) => {
        responseItem.workflowProcess!.tracing!.push({
          ...loopStartedData,
          status: WorkflowRunningStatus.Running,
        })
        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      onLoopFinish: ({ data: loopFinishedData }) => {
        const tracing = responseItem.workflowProcess!.tracing!
        const loopIndex = tracing.findIndex(item => item.node_id === loopFinishedData.node_id
          && (item.execution_metadata?.parallel_id === loopFinishedData.execution_metadata?.parallel_id || item.parallel_id === loopFinishedData.execution_metadata?.parallel_id))!
        tracing[loopIndex] = {
          ...tracing[loopIndex],
          ...loopFinishedData,
          status: WorkflowRunningStatus.Succeeded,
        }

        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      onHumanInputRequired: ({ data: humanInputRequiredData }) => {
        if (!responseItem.humanInputFormDataList) {
          responseItem.humanInputFormDataList = [humanInputRequiredData]
        }
        else {
          const currentFormIndex = responseItem.humanInputFormDataList!.findIndex(item => item.node_id === humanInputRequiredData.node_id)
          if (currentFormIndex > -1) {
            responseItem.humanInputFormDataList[currentFormIndex] = humanInputRequiredData
          }
          else {
            responseItem.humanInputFormDataList.push(humanInputRequiredData)
          }
        }
        const currentTracingIndex = responseItem.workflowProcess!.tracing!.findIndex(item => item.node_id === humanInputRequiredData.node_id)
        if (currentTracingIndex > -1) {
          responseItem.workflowProcess!.tracing[currentTracingIndex]!.status = NodeRunningStatus.Paused
          updateCurrentQAOnTree({
            placeholderQuestionId,
            questionItem,
            responseItem,
            parentId: data.parent_message_id,
          })
        }
      },
      onHumanInputFormFilled: ({ data: humanInputFilledFormData }) => {
        if (responseItem.humanInputFormDataList?.length) {
          const currentFormIndex = responseItem.humanInputFormDataList!.findIndex(item => item.node_id === humanInputFilledFormData.node_id)
          responseItem.humanInputFormDataList.splice(currentFormIndex, 1)
        }
        if (!responseItem.humanInputFilledFormDataList) {
          responseItem.humanInputFilledFormDataList = [humanInputFilledFormData]
        }
        else {
          responseItem.humanInputFilledFormDataList.push(humanInputFilledFormData)
        }
        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      onHumanInputFormTimeout: ({ data: humanInputFormTimeoutData }) => {
        if (responseItem.humanInputFormDataList?.length) {
          const currentFormIndex = responseItem.humanInputFormDataList!.findIndex(item => item.node_id === humanInputFormTimeoutData.node_id)
          responseItem.humanInputFormDataList[currentFormIndex]!.expiration_time = humanInputFormTimeoutData.expiration_time
        }
        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
      onWorkflowPaused: ({ data: workflowPausedData }) => {
        const url = `/workflow/${workflowPausedData.workflow_run_id}/events`
        pausedStateRef.current = true
        sseGet(
          url,
          {},
          otherOptions,
        )
        responseItem.workflowProcess!.status = WorkflowRunningStatus.Paused
        updateCurrentQAOnTree({
          placeholderQuestionId,
          questionItem,
          responseItem,
          parentId: data.parent_message_id,
        })
      },
    }

    // Abort the previous workflow events SSE request
    if (workflowEventsAbortControllerRef.current)
      workflowEventsAbortControllerRef.current.abort()

    ssePost(
      url,
      {
        body: bodyParams,
      },
      otherOptions,
    )
    return true
  }, [
    t,
    chatTree.length,
    threadMessages,
    config?.suggested_questions_after_answer,
    updateCurrentQAOnTree,
    updateChatTreeNode,
    handleResponding,
    formatTime,
    createAudioPlayerManager,
    formSettings,
    tryDeductMessage,
  ])

  const handleAnnotationEdited = useCallback((query: string, answer: string, index: number) => {
    const targetQuestionId = chatList[index - 1]!.id
    const targetAnswerId = chatList[index]!.id

    updateChatTreeNode(targetQuestionId, {
      content: query,
    })
    updateChatTreeNode(targetAnswerId, {
      content: answer,
      annotation: {
        ...chatList[index]!.annotation,
        logAnnotation: undefined,
      } as Annotation,
    })
  }, [chatList, updateChatTreeNode])

  const handleAnnotationAdded = useCallback((annotationId: string, authorName: string, query: string, answer: string, index: number) => {
    const targetQuestionId = chatList[index - 1]!.id
    const targetAnswerId = chatList[index]!.id

    updateChatTreeNode(targetQuestionId, {
      content: query,
    })

    updateChatTreeNode(targetAnswerId, {
      content: chatList[index]!.content,
      annotation: {
        id: annotationId,
        authorName,
        logAnnotation: {
          content: answer,
          account: {
            id: '',
            name: authorName,
            email: '',
          },
        },
      } as Annotation,
    })
  }, [chatList, updateChatTreeNode])

  const handleAnnotationRemoved = useCallback((index: number) => {
    const targetAnswerId = chatList[index]!.id

    updateChatTreeNode(targetAnswerId, {
      content: chatList[index]!.content,
      annotation: {
        ...chatList[index]!.annotation,
        id: '',
      } as Annotation,
    })
  }, [chatList, updateChatTreeNode])

  const handleSwitchSibling = useCallback((
    siblingMessageId: string,
    callbacks: SendCallback,
  ) => {
    setTargetMessageId(siblingMessageId)

    // Helper to find message in tree
    const findMessageInTree = (nodes: ChatItemInTree[], targetId: string): ChatItemInTree | undefined => {
      for (const node of nodes) {
        if (node.id === targetId)
          return node
        if (node.children) {
          const found = findMessageInTree(node.children, targetId)
          if (found)
            return found
        }
      }
      return undefined
    }

    const targetMessage = findMessageInTree(chatTreeRef.current, siblingMessageId)
    if (targetMessage?.workflow_run_id && targetMessage.humanInputFormDataList && targetMessage.humanInputFormDataList.length > 0) {
      handleResume(
        targetMessage.id,
        targetMessage.workflow_run_id,
        callbacks,
      )
    }
  }, [setTargetMessageId, handleResume])

  useEffect(() => {
    if (!clearChatList)
      return

    conversationIdRef.current = ''
    taskIdRef.current = ''
    handleStop()
    chatTreeRef.current = []
    // Parent toggles clearChatList to reset chat state imperatively.
    // eslint-disable-next-line react/set-state-in-effect
    setChatTree([])
    // eslint-disable-next-line react/set-state-in-effect
    setSuggestedQuestions([])
    clearChatListCallback?.(false)
  }, [clearChatList, clearChatListCallback, handleStop])

  return {
    chatList,
    setTargetMessageId,
    isResponding,
    setIsResponding,
    handleSend,
    handleResume,
    handleSwitchSibling,
    suggestedQuestions,
    handleRestart,
    handleStop,
    handleAnnotationEdited,
    handleAnnotationAdded,
    handleAnnotationRemoved,
  }
}
