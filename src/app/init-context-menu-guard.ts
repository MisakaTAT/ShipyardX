interface ContextMenuGuardOptions {
  isProd: boolean
  target?: Document | HTMLElement
}

export function installContextMenuGuard({ isProd, target = document }: ContextMenuGuardOptions) {
  if (!isProd) return

  target.addEventListener('contextmenu', (event) => {
    event.preventDefault()
  })
}
