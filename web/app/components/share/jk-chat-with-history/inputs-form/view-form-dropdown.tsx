import { Popover, PopoverContent, PopoverTrigger } from '@langgenius/dify-ui/popover'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ActionButton, { ActionButtonState } from '@/app/components/base/action-button'
import InputsFormContent from './content'

const ViewFormDropdown = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger
        render={(
          <ActionButton size="l" state={open ? ActionButtonState.Hover : ActionButtonState.Default}>
            <div className="i-ri-chat-settings-line h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          </ActionButton>
        )}
      />
      <PopoverContent
        placement="bottom-end"
        sideOffset={4}
        alignOffset={4}
        popupClassName="border-none bg-transparent shadow-none"
      >
        <div className="w-[400px] rounded-2xl border-[0.5px] border-components-panel-border bg-components-panel-bg shadow-lg backdrop-blur-xs">
          <div className="flex items-center gap-3 rounded-t-2xl border-b border-divider-subtle px-6 py-4">
            <div className="i-custom-public-other-message-3-fill h-6 w-6 shrink-0" aria-hidden="true" />
            <div className="grow system-xl-semibold text-text-secondary">{t('chat.chatSettingsTitle', { ns: 'share' })}</div>
          </div>
          <div className="p-6">
            <InputsFormContent />
          </div>
        </div>
      </PopoverContent>
    </Popover>

  )
}

export default ViewFormDropdown
