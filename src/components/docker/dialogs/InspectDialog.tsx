import { useEffect, useState, useCallback, useMemo } from 'react'
import { commands } from '@/types/app-bindings'
import Editor from '@monaco-editor/react'
import { RefreshCw, Copy, Check, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogCloseIconButton,
  DialogContent,
  DialogFullscreenBody,
  DialogLoadingOverlay,
  DialogPanelTitle,
  DialogPanelToolbar,
  DialogPanelToolbarEnd,
  DialogPanelToolbarIcon,
} from '@/components/ui/dialog'
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
    [],
  )

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent variant="fullscreen">
        <DialogPanelToolbar>
          <DialogPanelToolbarIcon>
            <ScanSearch />
          </DialogPanelToolbarIcon>
          <DialogPanelTitle>{targetLabel}</DialogPanelTitle>

          <Button type="button" variant="default" disabled={loading} title="重新加载" onClick={() => void load()}>
            <RefreshCw className={`${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>

          <Button type="button" variant="outline" disabled={!json} title="复制 JSON" onClick={handleCopy}>
            {copied ? <Check className="text-green-500" /> : <Copy />}
            复制
          </Button>

          <DialogPanelToolbarEnd className="gap-0">
            <DialogCloseIconButton onClick={onClose} />
          </DialogPanelToolbarEnd>
        </DialogPanelToolbar>

        <DialogFullscreenBody tone="editor">
          {loading ? <DialogLoadingOverlay>加载中…</DialogLoadingOverlay> : null}
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
        </DialogFullscreenBody>
      </DialogContent>
    </Dialog>
  )
}
