import { RefreshCw, ShieldAlert, Terminal, Unplug } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/shared/ui/button'
import { InlineCode } from '@/shared/components/inline-code'

interface DockerAccessGuideProps {
  status: 'no_permission' | 'no_docker' | 'error'
  username: string
  onRetry: () => void
  onDisconnect: () => void
  onOpenTerminal: () => void
}

/** Docker 不可用时的引导页（权限/未安装/错误三种分支） */
export function DockerAccessGuide({ status, username, onRetry, onDisconnect, onOpenTerminal }: DockerAccessGuideProps) {
  const isPermission = status === 'no_permission'
  const isNoDocker = status === 'no_docker'

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10">
            <ShieldAlert className="size-7 text-amber-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {isPermission ? 'Docker 权限不足' : isNoDocker ? 'Docker 未就绪' : '无法连接 Docker'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isPermission
              ? `当前用户 ${username} 没有访问 Docker socket 的权限，请将该用户加入 docker 用户组。`
              : isNoDocker
                ? '目标服务器上未找到 Docker socket，请确认 Docker 已安装并正在运行。'
                : '无法连接到远程 Docker 服务，请检查服务器状态。'}
          </p>
        </div>

        {isPermission ? (
          <StepGroup title="按以下步骤配置：">
            <Step index={1} title="将用户加入 docker 组">
              <InlineCode block>{`sudo usermod -aG docker ${username}`}</InlineCode>
            </Step>
            <Step index={2} title="重新登录使组变更生效">
              <InlineCode block>newgrp docker</InlineCode>
            </Step>
            <Step index={3} title="验证权限">
              <InlineCode block>docker info</InlineCode>
            </Step>
          </StepGroup>
        ) : isNoDocker ? (
          <StepGroup title="可能的原因与解决方式：">
            <Step index={1} title="Docker 未安装">
              <InlineCode block>curl -fsSL https://get.docker.com | sh</InlineCode>
            </Step>
            <Step index={2} title="Docker 服务未启动">
              <InlineCode block>sudo systemctl start docker</InlineCode>
            </Step>
            <Step index={3} title="设置开机自启">
              <InlineCode block>sudo systemctl enable docker</InlineCode>
            </Step>
          </StepGroup>
        ) : null}

        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={onDisconnect}>
            <Unplug />
            断开连接
          </Button>
          <Button variant="outline" onClick={onOpenTerminal}>
            <Terminal />
            打开终端
          </Button>
          <Button onClick={onRetry}>
            <RefreshCw />
            重新检测
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
