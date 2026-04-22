import { Dialog, DialogContent } from '@/shared/ui/dialog'
import { fullScreenDialogContent } from '@/shared/styles/variants'
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
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className={fullScreenDialogContent} showCloseButton={false}>
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
