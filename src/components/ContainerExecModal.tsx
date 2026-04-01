import { Dialog, DialogContent } from '@/components/ui/dialog'
import TerminalPanel from '@/components/TerminalPanel'

interface Props {
  open: boolean
  serverId: string
  containerId: string
  containerName: string
  onClose: () => void
}

export default function ContainerExecModal({ open, serverId, containerId, containerName, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent
        showCloseButton={false}
        className="fixed! inset-0! left-0! top-0! flex! h-dvh max-h-dvh w-full max-w-full translate-x-0! translate-y-0! flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none sm:max-w-full"
      >
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

