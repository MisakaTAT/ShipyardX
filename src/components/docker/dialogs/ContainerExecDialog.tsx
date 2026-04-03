import { Dialog, DialogContent } from '@/components/ui/dialog'
import TerminalPanel from '@/components/docker/panels/TerminalPanel'

interface Props {
  open: boolean
  serverId: string
  containerId: string
  containerName: string
  onClose: () => void
}

export default function ContainerExecDialog({ open, serverId, containerId, containerName, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent variant="fullscreen">
        <div className="h-full w-full">
          <TerminalPanel
            serverId={serverId}
            containerId={containerId}
            title={`docker exec -it ${containerName} /bin/sh`}
            onRequestClose={onClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
