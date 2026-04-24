import { StandardFullScreenDialog } from '@/shared/components/standard-fullscreen-dialog'
import TerminalPanel from '@/features/docker-terminal/ui/terminal-panel'

interface Props {
  open: boolean
  serverId: string
  containerId: string
  containerName: string
  onClose: () => void
}

export default function ContainerExecDialog({ open, serverId, containerId, containerName, onClose }: Props) {
  return (
    <StandardFullScreenDialog
      open={open}
      onOpenChange={(v) => (!v ? onClose() : null)}
      title="Terminal"
      subtitle={containerName}
      showHeader={false}
    >
      <div className="h-full w-full">
        <TerminalPanel
          serverId={serverId}
          containerId={containerId}
          title={`docker exec -it ${containerName} /bin/sh`}
          onRequestClose={onClose}
        />
      </div>
    </StandardFullScreenDialog>
  )
}
