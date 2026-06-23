import type { FileEntity } from '../types'
import type { FileUpload } from '@/app/components/base/features/types'
import { Button } from '@langgenius/dify-ui/button'
import { cn } from '@langgenius/dify-ui/cn'
import {
  useCallback,
} from 'react'
import { useTranslation } from 'react-i18next'
import { TransferMethod } from '@/types/app'
import FileItem from '../file-uploader-in-attachment/file-item'
import JkFileFromLinkOrLocal from '../jk-file-from-link-or-local'
import JkFileInput from '../jk-file-input'
import { useFile } from '../jk-hooks'
import {
  FileContextProvider,
  useStore,
} from '../store'

type Option = {
  value: string
  label: string
  icon: React.JSX.Element
}
type FileUploaderInAttachmentProps = {
  isDisabled?: boolean
  fileConfig: FileUpload
}
const JkFileUploaderInAttachment = ({
  isDisabled,
  fileConfig,
}: FileUploaderInAttachmentProps) => {
  const { t } = useTranslation()
  const files = useStore(s => s.files)
  const {
    handleRemoveFile,
    handleReUploadFile,
  } = useFile(fileConfig)
  const options = [
    {
      value: TransferMethod.local_file,
      label: t('fileUploader.uploadFromComputer', { ns: 'common' }),
      icon: <span className="i-ri-upload-cloud-2-line h-4 w-4" aria-hidden="true" />,
    },
    {
      value: TransferMethod.remote_url,
      label: t('fileUploader.pasteFileLink', { ns: 'common' }),
      icon: <span className="i-ri-link h-4 w-4" aria-hidden="true" />,
    },
  ]

  const renderButton = useCallback((option: Option, open?: boolean) => {
    return (
      <Button
        key={option.value}
        variant="tertiary"
        className={cn('relative grow', open && 'bg-components-button-tertiary-bg-hover')}
        disabled={!!(fileConfig.number_limits && files.length >= fileConfig.number_limits)}
      >
        {option.icon}
        <span className="ml-1">{option.label}</span>
        {
          option.value === TransferMethod.local_file && (
            <JkFileInput fileConfig={fileConfig} />
          )
        }
      </Button>
    )
  }, [fileConfig, files.length])
  const renderTrigger = useCallback((option: Option) => {
    return (open: boolean) => renderButton(option, open)
  }, [renderButton])
  const renderOption = useCallback((option: Option) => {
    if (option.value === TransferMethod.local_file && fileConfig?.allowed_file_upload_methods?.includes(TransferMethod.local_file))
      return renderButton(option)

    if (option.value === TransferMethod.remote_url && fileConfig?.allowed_file_upload_methods?.includes(TransferMethod.remote_url)) {
      return (
        <JkFileFromLinkOrLocal
          key={option.value}
          showFromLocal={false}
          trigger={renderTrigger(option)}
          fileConfig={fileConfig}
        />
      )
    }
  }, [renderButton, renderTrigger, fileConfig])

  return (
    <div>
      {!isDisabled && (
        <div className="flex items-center space-x-1">
          {options.map(renderOption)}
        </div>
      )}
      <div className="mt-1 space-y-1">
        {
          files.map(file => (
            <FileItem
              key={file.id}
              file={file}
              showDeleteAction={!isDisabled}
              showDownloadAction={false}
              onRemove={() => handleRemoveFile(file.id)}
              onReUpload={() => handleReUploadFile(file.id)}
              canPreview={fileConfig.preview_config?.file_type_list?.includes(file.type)}
              previewMode={fileConfig.preview_config?.mode}
            />
          ))
        }
      </div>
    </div>
  )
}

export type JkFileUploaderInAttachmentWrapperProps = {
  value?: FileEntity[]
  onChange: (files: FileEntity[]) => void
  fileConfig: FileUpload
  isDisabled?: boolean
}
const JkFileUploaderInAttachmentWrapper = ({
  value,
  onChange,
  fileConfig,
  isDisabled,
}: JkFileUploaderInAttachmentWrapperProps) => {
  return (
    <FileContextProvider
      value={value}
      onChange={onChange}
    >
      <JkFileUploaderInAttachment isDisabled={isDisabled} fileConfig={fileConfig} />
    </FileContextProvider>
  )
}

export default JkFileUploaderInAttachmentWrapper
