import { memoryLocation } from 'wouter/memory-location'

export const APP_PATHS = {
  workspace: '/workspace',
  portForward: '/port-forward',
  hostKeys: '/host-keys',
  store: '/store',
  settings: '/settings',
} as const

export type AppMainPath = (typeof APP_PATHS)[keyof typeof APP_PATHS]

export const appMemoryLocation = memoryLocation({ path: APP_PATHS.workspace })
