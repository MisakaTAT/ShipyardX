import { useState } from 'react'
import { Box, Loader2, Play, Power, RefreshCw, Trash2 } from 'lucide-react'
import { useInstalledApps, useUninstallApp, useOperateInstalledApp, type InstalledApp } from '@/features/appstore/api/use-appstore'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { ConfirmDialog } from '@/shared/components'

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  running: { label: '运行中', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  stopped: { label: '已停止', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  error: { label: '异常', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  unknown: { label: '未知', className: 'bg-muted text-muted-foreground' },
}

export function InstalledAppsPanel() {
  const { data: installed = [], isLoading } = useInstalledApps()
  const uninstall = useUninstallApp()
  const operate = useOperateInstalledApp()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (installed.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <Box className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-2 text-sm text-muted-foreground">尚未安装任何应用</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="space-y-2">
        {installed.map((app) => (
          <InstalledAppRow
            key={app.install_id}
            app={app}
            onStart={() => operate.mutate({ installId: app.install_id, operation: 'start' })}
            onStop={() => operate.mutate({ installId: app.install_id, operation: 'stop' })}
            onRestart={() => operate.mutate({ installId: app.install_id, operation: 'restart' })}
            onDelete={() => setDeleteId(app.install_id)}
            disabled={operate.isPending || uninstall.isPending}
          />
        ))}
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        title="卸载应用"
        description="确定要卸载此应用吗？此操作将删除所有容器和数据卷，不可撤销。"
        destructive
        confirmText="卸载"
        onConfirm={() => {
          if (!deleteId) return
          uninstall.mutate(deleteId)
        }}
      />
    </div>
  )
}

function InstalledAppRow({
  app,
  onStart,
  onStop,
  onRestart,
  onDelete,
  disabled,
}: {
  app: InstalledApp
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onDelete: () => void
  disabled: boolean
}) {
  const status = STATUS_MAP[app.status] || STATUS_MAP.unknown

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-foreground">{app.app_name}</h4>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {app.version}
          </Badge>
          <Badge className={`text-[10px] px-1.5 py-0 ${status.className}`}>
            {status.label}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          路径: {app.install_path}
        </p>
        <p className="text-[10px] text-muted-foreground/60">
          安装于 {app.created_at}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {app.status === 'running' ? (
          <Button variant="outline" size="icon-sm" onClick={onStop} disabled={disabled} title="停止">
            <Power className="size-3.5" />
          </Button>
        ) : (
          <Button variant="outline" size="icon-sm" onClick={onStart} disabled={disabled} title="启动">
            <Play className="size-3.5" />
          </Button>
        )}
        <Button variant="outline" size="icon-sm" onClick={onRestart} disabled={disabled} title="重启">
          <RefreshCw className="size-3.5" />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={onDelete} disabled={disabled} title="卸载">
          <Trash2 className="size-3.5 text-red-500" />
        </Button>
      </div>
    </div>
  )
}
