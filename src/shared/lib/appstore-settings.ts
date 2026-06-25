import type { AppstoreSettings } from '@/types/app-bindings'

export interface LocalAppstoreSource {
  id: string
  name: string
  repoUrl: string
  enabled: boolean
}

export interface LocalAppstoreSettings {
  sources: LocalAppstoreSource[]
  proxyEnabled: boolean
  proxyUrl: string
}

export const DEFAULT_APPSTORE_SOURCES: LocalAppstoreSource[] = [
  {
    id: '1panel',
    name: '1Panel',
    repoUrl: 'https://github.com/1Panel-dev/appstore.git',
    enabled: true,
  },
  {
    id: 'okxlin',
    name: 'Okxlin',
    repoUrl: 'https://github.com/okxlin/appstore.git',
    enabled: true,
  },
]

export function toCommandAppstoreSettings(settings: LocalAppstoreSettings): AppstoreSettings {
  return {
    sources: settings.sources.map((source) => ({
      id: source.id,
      name: source.name,
      repo_url: source.repoUrl,
      enabled: source.enabled,
    })),
    proxy_enabled: settings.proxyEnabled,
    proxy_url: settings.proxyUrl,
  }
}

export function fromCommandAppstoreSettings(settings: AppstoreSettings): LocalAppstoreSettings {
  return {
    sources: settings.sources.map((source) => ({
      id: source.id,
      name: source.name,
      repoUrl: source.repo_url,
      enabled: source.enabled,
    })),
    proxyEnabled: settings.proxy_enabled,
    proxyUrl: settings.proxy_url,
  }
}
