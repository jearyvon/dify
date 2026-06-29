import type { ConversationItem } from '@/models/share'
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogCancelButton,
  AlertDialogConfirmButton,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@langgenius/dify-ui/alert-dialog'
import { cn } from '@langgenius/dify-ui/cn'
import { Tooltip, TooltipContent, TooltipTrigger } from '@langgenius/dify-ui/tooltip'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ActionButton, { ActionButtonState } from '@/app/components/base/action-button'
import { useChatWithHistoryContext } from '@/app/components/base/chat/chat-with-history/context'
import Operation from '@/app/components/base/chat/chat-with-history/header/operation'
import RenameModal from '@/app/components/base/chat/chat-with-history/sidebar/rename-modal'
import ViewFormDropdown from '../inputs-form/view-form-dropdown'

const Header = () => {
  const {
    appData,
    currentConversationId,
    currentConversationItem,
    inputsForms,
    pinnedConversationList,
    handlePinConversation,
    handleUnpinConversation,
    conversationRenaming,
    handleRenameConversation,
    handleDeleteConversation,
    handleNewConversation,
    sidebarCollapseState,
    handleSidebarCollapse,
    isResponding,
  } = useChatWithHistoryContext()
  const { t } = useTranslation()
  const isSidebarCollapsed = sidebarCollapseState

  const isPin = pinnedConversationList.some(item => item.id === currentConversationId)

  const [showConfirm, setShowConfirm] = useState<ConversationItem | null>(null)
  const [showRename, setShowRename] = useState<ConversationItem | null>(null)
  const handleOperate = useCallback((type: string) => {
    if (type === 'pin')
      handlePinConversation(currentConversationId)

    if (type === 'unpin')
      handleUnpinConversation(currentConversationId)

    if (type === 'delete' && currentConversationItem)
      setShowConfirm(currentConversationItem)

    if (type === 'rename' && currentConversationItem)
      setShowRename(currentConversationItem)
  }, [currentConversationId, currentConversationItem, handlePinConversation, handleUnpinConversation])
  const handleCancelConfirm = useCallback(() => {
    setShowConfirm(null)
  }, [])
  const handleDelete = useCallback(() => {
    if (showConfirm)
      handleDeleteConversation(showConfirm.id, { onSuccess: handleCancelConfirm })
  }, [showConfirm, handleDeleteConversation, handleCancelConfirm])
  const handleCancelRename = useCallback(() => {
    setShowRename(null)
  }, [])
  const handleRename = useCallback((newName: string) => {
    if (showRename)
      handleRenameConversation(showRename.id, newName, { onSuccess: handleCancelRename })
  }, [showRename, handleRenameConversation, handleCancelRename])

  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between p-3">
        <div className={cn('flex items-center gap-1 transition-all duration-200 ease-in-out', !isSidebarCollapsed && 'opacity-0 select-none')}>
          <ActionButton className={cn(!isSidebarCollapsed && 'cursor-default')} size="l" onClick={() => handleSidebarCollapse(false)}>
            <div className="i-ri-layout-right-2-line h-[18px] w-[18px]" aria-hidden="true" />
          </ActionButton>
          {/* <div className="mr-1 shrink-0">
            <AppIcon
              size="large"
              iconType={appData?.site.icon_type}
              icon={appData?.site.icon}
              background={appData?.site.icon_background}
              imageUrl={appData?.site.icon_url}
            />
          </div> */}
          {!currentConversationId && (
            <div className={cn('grow truncate system-md-semibold text-text-secondary')}>{appData?.site.title}</div>
          )}
          {currentConversationId && currentConversationItem && isSidebarCollapsed && (
            <>
              {/* <div className="p-1 text-divider-deep">/</div> */}
              <Operation
                title={currentConversationItem?.name || ''}
                isPinned={!!isPin}
                togglePin={() => handleOperate(isPin ? 'unpin' : 'pin')}
                isShowDelete
                isShowRenameConversation
                onRenameConversation={() => handleOperate('rename')}
                onDelete={() => handleOperate('delete')}
              />
            </>
          )}
          <div className="flex items-center px-1">
            <div className="h-[14px] w-px bg-divider-regular"></div>
          </div>
          {isSidebarCollapsed && (
            <Tooltip>
              <TooltipTrigger
                disabled={!!currentConversationId}
                render={(
                  <div>
                    <ActionButton
                      size="l"
                      state={(!currentConversationId || isResponding) ? ActionButtonState.Disabled : ActionButtonState.Default}
                      disabled={!currentConversationId || isResponding}
                      onClick={handleNewConversation}
                    >
                      <div className="i-ri-edit-box-line h-[18px] w-[18px]" aria-hidden="true" />
                    </ActionButton>
                  </div>
                )}
              />
              <TooltipContent>
                {t('chat.newChatTip', { ns: 'share' })}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-1">
          {currentConversationId && (
            <Tooltip>
              <TooltipTrigger
                render={(
                  <ActionButton size="l" onClick={handleNewConversation}>
                    <div className="i-ri-reset-left-line h-[18px] w-[18px]" aria-hidden="true" />
                  </ActionButton>
                )}
              />
              <TooltipContent>
                {t('chat.resetChat', { ns: 'share' })}
              </TooltipContent>
            </Tooltip>
          )}
          {currentConversationId && inputsForms.length > 0 && (
            <ViewFormDropdown />
          )}
        </div>
      </div>
      <AlertDialog open={!!showConfirm} onOpenChange={open => !open && handleCancelConfirm()}>
        <AlertDialogContent>
          <div className="flex flex-col gap-2 px-6 pt-6 pb-4">
            <AlertDialogTitle className="w-full truncate title-2xl-semi-bold text-text-primary">
              {t('chat.deleteConversation.title', { ns: 'share' })}
            </AlertDialogTitle>
            <AlertDialogDescription className="w-full system-md-regular wrap-break-word whitespace-pre-wrap text-text-tertiary">
              {t('chat.deleteConversation.content', { ns: 'share' }) || ''}
            </AlertDialogDescription>
          </div>
          <AlertDialogActions>
            <AlertDialogCancelButton>{t('operation.cancel', { ns: 'common' })}</AlertDialogCancelButton>
            <AlertDialogConfirmButton onClick={handleDelete}>
              {t('operation.confirm', { ns: 'common' })}
            </AlertDialogConfirmButton>
          </AlertDialogActions>
        </AlertDialogContent>
      </AlertDialog>
      {showRename && (
        <RenameModal
          isShow
          onClose={handleCancelRename}
          saveLoading={conversationRenaming}
          name={showRename?.name || ''}
          onSave={handleRename}
        />
      )}
    </>
  )
}

export default Header
