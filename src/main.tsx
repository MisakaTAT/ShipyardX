import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App'
import { installContextMenuGuard } from '@/app/init-context-menu-guard'
import '@/app/styles/index.css'

installContextMenuGuard({ isProd: import.meta.env.PROD })

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
