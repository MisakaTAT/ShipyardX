import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { Button } from '@/shared/ui/button'

export function SettingsPanelShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-8 pt-2 pb-10">{children}</div>
}

export function SettingsResetRow({
  description,
  confirmDescription,
  onReset,
  disabled,
  label,
}: {
  description: string
  confirmDescription?: string
  onReset: () => void
  disabled?: boolean
  label?: string
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const buttonLabel = label ?? t('common.restoreDefaults')

  return (
    <>
      <SettingsActionRow
        title={t('settings.reset.title')}
        description={description}
        action={
          <Button
            type="button"
            variant="destructive"
            onClick={() => setConfirming(true)}
            disabled={disabled}
            className="w-full max-w-xs justify-center"
          >
            <RotateCcw className="size-4" />
            <span>{buttonLabel}</span>
          </Button>
        }
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('settings.reset.confirmTitle')}
        description={`${confirmDescription ?? description}${t('settings.reset.confirmSuffix')}`}
        confirmText={buttonLabel}
        destructive
        onConfirm={onReset}
      />
    </>
  )
}

export function SettingsActionRow({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <div className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <div>{action}</div>
    </div>
  )
}
