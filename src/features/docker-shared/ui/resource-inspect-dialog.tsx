import { useCallback, useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Check, Copy, RefreshCw, ScanSearch } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { StandardFullScreenDialog } from '@/shared/components/standard-fullscreen-dialog'
import { toastAppError } from '@/shared/lib/errors'
import { useResourceInspect, type InspectKind } from '@/features/docker-shared/api/use-resource-inspect'

interface Props {
  serverId: string
  kind: InspectKind
  targetId: string
  targetLabel: string
  onClose: () => void
}

export default function ResourceInspectDialog({ serverId, kind, targetId, targetLabel, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const inspectQuery = useResourceInspect(serverId, kind, targetId)
  const json = inspectQuery.data ?? ''
  const loading = inspectQuery.isLoading || inspectQuery.isFetching

  useEffect(() => {
    if (inspectQuery.error) toastAppError(inspectQuery.error)
  }, [inspectQuery.error])

  const handleCopy = useCallback(() => {
    if (!json) return
    void navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [json])

  const editorOptions = useMemo(
    () => ({
      readOnly: true,
      minimap: { enabled: true, scale: 0.85 },
      scrollBeyondLastLine: false,
      wordWrap: 'on' as const,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      tabSize: 2,
      automaticLayout: true,
      padding: { top: 12, bottom: 12 },
      renderLineHighlight: 'none' as const,
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      folding: true,
      lineNumbers: 'on' as const,
    }),
    []
  )

  return (
    <StandardFullScreenDialog
      open
      onOpenChange={(v) => (!v ? onClose() : null)}
      title={targetLabel}
      icon={ScanSearch}
      headerActions={
        <>
          <Button
            type="button"
            variant="default"
            disabled={loading}
            title="重新加载"
            onClick={() => void inspectQuery.refetch()}
          >
            <RefreshCw className={`${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>

          <Button type="button" variant="outline" disabled={!json} title="复制 JSON" onClick={handleCopy}>
            {copied ? <Check className="text-green-500" /> : <Copy />}
            复制
          </Button>
        </>
      }
    >
      <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: '#1e1e1e' }}>
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              加载中…
            </div>
          </div>
        ) : null}
        <Editor
          height="100%"
          language="json"
          theme="vs-dark"
          value={json}
          options={editorOptions}
          loading={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">初始化编辑器…</div>
          }
        />
      </div>
    </StandardFullScreenDialog>
  )
}
