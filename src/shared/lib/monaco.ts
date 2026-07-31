import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

/** @monaco-editor/react 默认从 jsdelivr 拉取，会被 CSP 拦下且离线不可用，改用随包的本地副本 */
declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment
  }
}

window.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new JsonWorker()
    return new EditorWorker()
  },
}

loader.config({ monaco })

export { monaco }
