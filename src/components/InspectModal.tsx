import { useEffect, useState, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Editor from '@monaco-editor/react'
import { X, RefreshCw, Copy, Check, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type InspectKind = 'container' | 'image' | 'network' | 'volume'

interface Props {
  serverId: string
  kind: InspectKind
  targetId: string
  targetLabel: string
  onClose: () => void
}

export default function InspectModal({ serverId, kind, targetId, targetLabel, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [json, setJson] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let text: string
      switch (kind) {
        case 'container':
          text = await invoke<string>('inspect_container', { serverId, containerId: targetId })
          break
        case 'image':
          text = await invoke<string>('inspect_image', { serverId, imageId: targetId })
          break
        case 'network':
          text = await invoke<string>('inspect_network', { serverId, networkId: targetId })
          break
        case 'volume':
          text = await invoke<string>('inspect_volume', { serverId, name: targetId })
          break
        default:
          text = ''
      }
      setJson(text)
    } catch (e) {
      setJson('')
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [serverId, kind, targetId])

  useEffect(() => {
    void load()
  }, [load])

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
    [],
  )

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex! h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none',
          'fixed! inset-0! left-0! top-0! translate-x-0! translate-y-0!',
          'sm:max-w-full',
        )}
      >
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3"
          style={{ background: 'var(--bg-panel)' }}
        >
          <ScanSearch className="size-4 shrink-0 text-(--accent-text)" />
          <span className="mr-1 font-mono text-sm font-semibold text-(--text-strong)">{targetLabel}</span>

          <Button
            type="button"
            variant="default"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            title="重新加载"
            onClick={() => void load()}
          >
            <RefreshCw className={`size-3.5 stroke-[2.5] ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!json}
            title="复制 JSON"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="size-3.5 stroke-[2.5] text-green-500" />
            ) : (
              <Copy className="size-3.5 stroke-[2.5]" />
            )}
            复制
          </Button>

          <div className="ml-auto">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-lg text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)"
              onClick={onClose}
            >
              <X className="size-3.5 stroke-[2.5]" />
            </Button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: '#1e1e1e' }}>
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
              <div className="flex items-center gap-2 text-sm text-(--text-soft)">
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
              <div className="flex h-full items-center justify-center text-sm text-(--text-muted)">初始化编辑器…</div>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
