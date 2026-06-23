import type { FC, RefObject } from 'react'
import type { InputValueTypes, TextGenerationCustomConfig, TextGenerationRunControl } from './types'
import type { AccessMode } from '@/models/access-control'
import type { PromptConfig, SavedMessage, TextToSpeechConfig } from '@/models/debug'
import type { SiteInfo } from '@/models/share'
import type { VisionFile, VisionSettings } from '@/types/app'
import type { SystemFeatures } from '@/types/feature'
import { cn } from '@langgenius/dify-ui/cn'
import SavedItems from '@/app/components/app/text-generate/saved-items'
import RunBatch from './run-batch'
import RunOnce from './run-once'

type TextGenerationSidebarProps = {
  accessMode: AccessMode
  allTasksRun: boolean
  currentTab: string
  customConfig: TextGenerationCustomConfig | null
  inputs: Record<string, InputValueTypes>
  inputsRef: RefObject<Record<string, InputValueTypes>>
  isInstalledApp: boolean
  isPC: boolean
  isWorkflow: boolean
  onBatchSend: (data: string[][]) => void
  onInputsChange: (inputs: Record<string, InputValueTypes>) => void
  onRemoveSavedMessage: (messageId: string) => Promise<void>
  onRunOnceSend: () => void
  onTabChange: (tab: string) => void
  onVisionFilesChange: (files: VisionFile[]) => void
  promptConfig: PromptConfig
  resultExisted: boolean
  runControl: TextGenerationRunControl | null
  savedMessages: SavedMessage[]
  siteInfo: SiteInfo
  systemFeatures: SystemFeatures
  textToSpeechConfig: TextToSpeechConfig | null
  visionConfig: VisionSettings
}

const TextGenerationSidebar: FC<TextGenerationSidebarProps> = ({
  accessMode: _accessMode,
  allTasksRun,
  currentTab,
  customConfig,
  inputs,
  inputsRef,
  isInstalledApp,
  isPC,
  isWorkflow: _isWorkflow,
  onBatchSend,
  onInputsChange,
  onRemoveSavedMessage,
  onRunOnceSend,
  onTabChange,
  onVisionFilesChange,
  promptConfig,
  resultExisted,
  runControl,
  savedMessages,
  siteInfo,
  systemFeatures: _systemFeatures,
  textToSpeechConfig,
  visionConfig,
}) => {
  return (
    <div
      className={cn(
        'relative flex h-full shrink-0 flex-col',
        isPC ? 'w-[600px] max-w-[50%]' : resultExisted ? 'h-[calc(100%-64px)]' : '',
        isInstalledApp && 'rounded-l-2xl',
      )}
    >
      <div className={cn('shrink-0 space-y-4 border-b border-divider-subtle', isPC ? 'bg-components-panel-bg p-10 pb-0' : 'p-4 pb-0')}>
        {siteInfo.description && (
          <div className="system-xs-regular text-text-tertiary">{siteInfo.description}</div>
        )}
        <div className="h-5 w-full py-3"></div>
        {/* <TabHeader
          items={[
            { id: 'create', name: t('generation.tabs.create', { ns: 'share' }) },
            { id: 'batch', name: t('generation.tabs.batch', { ns: 'share' }) },
            ...(!isWorkflow
              ? [{
                  id: 'saved',
                  name: t('generation.tabs.saved', { ns: 'share' }),
                  isRight: true,
                  icon: <span aria-hidden className="i-ri-bookmark-3-line h-4 w-4" />,
                  extra: savedMessages.length > 0
                    ? (
                        <Badge className="ml-1">
                          {savedMessages.length}
                        </Badge>
                      )
                    : null,
                }]
              : []),
          ]}
          value={currentTab}
          onChange={onTabChange}
        /> */}
      </div>
      <div
        className={cn(
          'h-0 grow overflow-y-auto bg-components-panel-bg',
          isPC ? 'px-8' : 'px-4',
          !isPC && resultExisted && customConfig?.remove_webapp_brand && 'rounded-b-2xl border-b-[0.5px] border-divider-regular',
        )}
      >
        <div className={cn(currentTab === 'create' ? 'block' : 'hidden')}>
          <RunOnce
            siteInfo={siteInfo}
            inputs={inputs}
            inputsRef={inputsRef}
            onInputsChange={onInputsChange}
            promptConfig={promptConfig}
            onSend={onRunOnceSend}
            visionConfig={visionConfig}
            onVisionFilesChange={onVisionFilesChange}
            runControl={runControl}
          />
        </div>
        <div className={cn(currentTab === 'batch' ? 'block' : 'hidden')}>
          <RunBatch
            vars={promptConfig.prompt_variables}
            onSend={onBatchSend}
            isAllFinished={allTasksRun}
          />
        </div>
        {currentTab === 'saved' && (
          <SavedItems
            className={cn(isPC ? 'mt-6' : 'mt-4')}
            isShowTextToSpeech={textToSpeechConfig?.enabled}
            list={savedMessages}
            onRemove={onRemoveSavedMessage}
            onStartCreateContent={() => onTabChange('create')}
          />
        )}
      </div>
    </div>
  )
}

export default TextGenerationSidebar
