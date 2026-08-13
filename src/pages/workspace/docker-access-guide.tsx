import { RefreshCw, ServerCrash, ShieldAlert, Terminal, Unplug } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { InlineCode } from '@/shared/components/inline-code'

interface DockerAccessGuideProps {
  status: 'server_error' | 'no_permission' | 'no_docker' | 'error'
  username: string
  onRetry: () => void
  onDisconnect: () => void
  onOpenTerminal: () => void
}

export function DockerAccessGuide({ status, username, onRetry, onDisconnect, onOpenTerminal }: DockerAccessGuideProps) {
  const { t } = useTranslation()
  const isServerError = status === 'server_error'
  const isPermission = status === 'no_permission'
  const isNoDocker = status === 'no_docker'

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className={`flex size-14 items-center justify-center rounded-xl ${isServerError ? 'bg-red-500/10' : 'bg-amber-500/10'}`}
          >
            {isServerError ? (
              <ServerCrash className="size-7 text-red-500" />
            ) : (
              <ShieldAlert className="size-7 text-amber-500" />
            )}
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {isServerError
              ? t('ui.accessGuide.sshTitle')
              : isPermission
                ? t('ui.accessGuide.permTitle')
                : isNoDocker
                  ? t('ui.accessGuide.notReadyTitle')
                  : t('ui.accessGuide.failedTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isServerError
              ? t('ui.accessGuide.sshBody')
              : isPermission
                ? t('ui.accessGuide.permBody', { username })
                : isNoDocker
                  ? t('ui.accessGuide.notReadyBody')
                  : t('ui.accessGuide.failedBody')}
          </p>
        </div>

        {isServerError ? (
          <StepGroup title={t('ui.accessGuide.checkFirst')}>
            <Step index={1} title={t('ui.accessGuide.sshStep1')}>
              <InlineCode block>{t('ui.accessGuide.sshStep1Body')}</InlineCode>
            </Step>
            <Step index={2} title={t('ui.accessGuide.sshStep2')}>
              <InlineCode block>{t('ui.accessGuide.sshStep2Body')}</InlineCode>
            </Step>
            <Step index={3} title={t('ui.accessGuide.sshStep3')}>
              <InlineCode block>{`ssh ${username}@your-server`}</InlineCode>
            </Step>
          </StepGroup>
        ) : isPermission ? (
          <StepGroup title={t('ui.accessGuide.configSteps')}>
            <Step index={1} title={t('ui.accessGuide.permStep1')}>
              <InlineCode block>{`sudo usermod -aG docker ${username}`}</InlineCode>
            </Step>
            <Step index={2} title={t('ui.accessGuide.permStep2')}>
              <InlineCode block>newgrp docker</InlineCode>
            </Step>
            <Step index={3} title={t('ui.accessGuide.permStep3')}>
              <InlineCode block>docker info</InlineCode>
            </Step>
          </StepGroup>
        ) : isNoDocker ? (
          <StepGroup title={t('ui.accessGuide.causes')}>
            <Step index={1} title={t('ui.accessGuide.notReadyStep1')}>
              <InlineCode block>curl -fsSL https://get.docker.com | sh</InlineCode>
            </Step>
            <Step index={2} title={t('ui.accessGuide.notReadyStep2')}>
              <InlineCode block>sudo systemctl start docker</InlineCode>
            </Step>
            <Step index={3} title={t('ui.accessGuide.notReadyStep3')}>
              <InlineCode block>sudo systemctl enable docker</InlineCode>
            </Step>
          </StepGroup>
        ) : null}

        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={onDisconnect}>
            <Unplug />
            {t('ui.workspace.disconnect')}
          </Button>
          <Button variant="outline" onClick={onOpenTerminal}>
            <Terminal />
            {t('ui.workspace.openTerminal')}
          </Button>
          <Button onClick={onRetry}>
            <RefreshCw />
            {t('ui.workspace.recheck')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function StepGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-foreground">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function Step({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
        {index}
      </span>
      <div className="flex-1">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        {children}
      </div>
    </div>
  )
}
