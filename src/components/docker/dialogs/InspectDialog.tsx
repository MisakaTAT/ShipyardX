import { useEffect, useState, useCallback, useMemo } from 'react'
import { commands } from '@/types/app-bindings'
import Editor from '@monaco-editor/react'
import { RefreshCw, Copy, Check, ScanSearch, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type InspectKind = 'container' | 'image' | 'network' | 'volume'

interface Props {
  serverId: string
  kind: InspectKind
  targetId: string
  targetLabel: string
  onClose: () => void
}

export default function InspectDialog({ serverId, kind, targetId, targetLabel, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [json, setJson] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let text: string
      switch (kind) {
        case 'container':
          text = await commands.inspectContainer(serverId, targetId)
          break
        case 'image':
          text = await commands.inspectImage(serverId, targetId)
          break
        case 'network':
          text = await commands.inspectNetwork(serverId, targetId)
          break
        case 'volume':
          text = await commands.inspectVolume(serverId, targetId)
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
    []
  )

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        className="inset-0 h-dvh max-w-full translate-x-0 translate-y-0 rounded-none p-0"
        showCloseButton={false}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-5 py-3">
          <span className="flex shrink-0 text-primary [&_svg]:size-4">
            <ScanSearch />
          </span>
          <span className="mr-1 font-mono text-sm font-semibold text-foreground">{targetLabel}</span>

          <Button type="button" variant="default" disabled={loading} title="重新加载" onClick={() => void load()}>
            <RefreshCw className={`${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>

          <Button type="button" variant="outline" disabled={!json} title="复制 JSON" onClick={handleCopy}>
            {copied ? <Check className="text-green-500" /> : <Copy />}
            复制
          </Button>

          <div className="ml-auto flex items-center gap-0">
            <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

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
      </DialogContent>
    </Dialog>
  )
}
