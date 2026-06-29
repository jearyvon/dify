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
import { Button } from '@langgenius/dify-ui/button'
import { cn } from '@langgenius/dify-ui/cn'
import {
  useCallback,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import ActionButton from '@/app/components/base/action-button'
import { useChatWithHistoryContext } from '@/app/components/base/chat/chat-with-history/context'
import List from '@/app/components/base/chat/chat-with-history/sidebar/list'
import RenameModal from '@/app/components/base/chat/chat-with-history/sidebar/rename-modal'

type Props = {
  isPanel?: boolean
  panelVisible?: boolean
}

const Sidebar = ({ isPanel, panelVisible: _panelVisible }: Props) => {
  const { t } = useTranslation()
  const {
    handleNewConversation,
    pinnedConversationList,
    conversationList,
    currentConversationId,
    handleChangeConversation,
    handlePinConversation,
    handleUnpinConversation,
    conversationRenaming,
    handleRenameConversation,
    handleDeleteConversation,
    sidebarCollapseState,
    handleSidebarCollapse,
    isMobile,
    isResponding,
  } = useChatWithHistoryContext()
  const isSidebarCollapsed = sidebarCollapseState
  const [showConfirm, setShowConfirm] = useState<ConversationItem | null>(null)
  const [showRename, setShowRename] = useState<ConversationItem | null>(null)

  const handleOperate = useCallback((type: string, item: ConversationItem) => {
    if (type === 'pin')
      handlePinConversation(item.id)

    if (type === 'unpin')
      handleUnpinConversation(item.id)

    if (type === 'delete')
      setShowConfirm(item)

    if (type === 'rename')
      setShowRename(item)
  }, [handlePinConversation, handleUnpinConversation])
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
  const pinnedTitle = t('chat.pinnedTitle', { ns: 'share' }) || ''
  const deleteConversationContent = t('chat.deleteConversation.content', { ns: 'share' }) || ''

  return (
    <div className={cn(
      'flex w-full grow flex-col',
      isPanel && 'rounded-xl border-[0.5px] border-components-panel-border-subtle bg-components-panel-bg shadow-lg',
    )}
    >
      <div className={cn(
        'flex shrink-0 items-center gap-3 p-3 pr-2',
      )}
      >
        {/* <div className="shrink-0">
          <AppIcon
            size="large"
            iconType={appData?.site.icon_type}
            icon={appData?.site.icon}
            background={appData?.site.icon_background}
            imageUrl={appData?.site.icon_url}
          />
        </div> */}
        <div className={cn('grow truncate system-md-semibold text-text-secondary')}></div>
        {!isMobile && isSidebarCollapsed && (
          <ActionButton size="l" onClick={() => handleSidebarCollapse(false)}>
            <div className="i-ri-expand-right-line h-[18px] w-[18px]" aria-hidden="true" />
          </ActionButton>
        )}
        {!isMobile && !isSidebarCollapsed && (
          <ActionButton size="l" onClick={() => handleSidebarCollapse(true)}>
            <div className="i-ri-layout-left-2-line h-[18px] w-[18px]" aria-hidden="true" />
          </ActionButton>
        )}
      </div>
      <div className="shrink-0 px-3 py-4">
        <Button variant="secondary-accent" disabled={isResponding} className="w-full justify-center" onClick={handleNewConversation}>
          <div className="mr-1 i-ri-edit-box-line h-4 w-4" aria-hidden="true" />
          {t('chat.newChat', { ns: 'share' })}
        </Button>
      </div>
      <div className="h-0 grow space-y-2 overflow-y-auto px-3 pt-4">
        {!!pinnedConversationList.length && (
          <div className="mb-4">
            <List
              isPin
              title={pinnedTitle}
              list={pinnedConversationList}
              onChangeConversation={handleChangeConversation}
              onOperate={handleOperate}
              currentConversationId={currentConversationId}
            />
          </div>
        )}
        {!!conversationList.length && (
          <List
            title={(pinnedConversationList.length && t('chat.unpinnedTitle', { ns: 'share' })) || ''}
            list={conversationList}
            onChangeConversation={handleChangeConversation}
            onOperate={handleOperate}
            currentConversationId={currentConversationId}
          />
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between p-3">
        {/* <MenuDropdown
          hideLogout={isInstalledApp}
          placement="top-start"
          data={appData?.site}
          forceClose={isPanel && !panelVisible}
        /> */}
        {/* <div className="shrink-0">
          {!appData?.custom_config?.remove_webapp_brand && (
            <div className={cn(
              'flex shrink-0 items-center gap-1.5 px-1',
            )}
            >
              <div className="system-2xs-medium-uppercase text-text-tertiary">{t('chat.poweredBy', { ns: 'share' })}</div>
              {
                systemFeatures.branding.enabled && systemFeatures.branding.workspace_logo
                  ? <img src={systemFeatures.branding.workspace_logo} alt="logo" className="block h-5 w-auto" />
                  : appData?.custom_config?.replace_webapp_logo
                    ? <img src={`${appData?.custom_config?.replace_webapp_logo}`} alt="logo" className="block h-5 w-auto" />
                    : <DifyLogo size="small" />
              }
            </div>
          )}
        </div> */}
        <AlertDialog open={!!showConfirm} onOpenChange={open => !open && handleCancelConfirm()}>
          <AlertDialogContent>
            <div className="flex flex-col gap-2 px-6 pt-6 pb-4">
              <AlertDialogTitle className="w-full truncate title-2xl-semi-bold text-text-primary">
                {t('chat.deleteConversation.title', { ns: 'share' })}
              </AlertDialogTitle>
              <AlertDialogDescription className="w-full system-md-regular wrap-break-word whitespace-pre-wrap text-text-tertiary">
                {deleteConversationContent}
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
      </div>
    </div>
  )
}

export default Sidebar
