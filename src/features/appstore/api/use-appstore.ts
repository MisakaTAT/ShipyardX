/**
 * App Store API hooks
 * 由于 TypeScript 绑定尚未重新生成，手动声明 appstore 相关的类型和命令
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { invoke as __TAURI_INVOKE } from '@tauri-apps/api/core'
import { qk } from '@/shared/api/query-keys'

// ---- Types (match Rust-side specta types) ----

export interface DescriptionI18n {
  en: string
  es_es: string
  ja: string
  ms: string
  pt_br: string
  ru: string
  ko: string
  zh_hant: string
  zh: string
  tr: string
}

export interface FormFieldLabel {
  en: string
  es_es: string
  ja: string
  ms: string
  pt_br: string
  ru: string
  ko: string
  zh_hant: string
  zh: string
  tr: string
}

export interface FormFieldValue {
  label: string
  value: string
}

export interface FormField {
  env_key: string
  default: string | null
  label: FormFieldLabel
  required: boolean
  type: string
  values: FormFieldValue[]
  random: boolean
  rule: string
}

export interface AppListItem {
  key: string
  name: string
  type: string
  tags: string[]
  description: string
  short_desc_zh: string
  short_desc_en: string
  website: string
  icon: string // base64
  installed: boolean
  versions: string[]
}

export interface AppVersionInfo {
  version: string
  form_fields: FormField[]
  compose_preview: string
}

export interface AppDetail {
  key: string
  name: string
  tags: string[]
  description: DescriptionI18n
  short_desc_zh: string
  short_desc_en: string
  website: string
  github: string
  document: string
  icon: string
  installed: boolean
  versions: AppVersionInfo[]
  readme_zh: string
  readme_en: string
}

export interface InstallAppRequest {
  server_id: string
  app_key: string
  version: string
  env_values: Record<string, string>
}

export interface InstalledApp {
  install_id: string
  app_key: string
  app_name: string
  version: string
  server_id: string
  install_path: string
  status: string // running | stopped | error | unknown
  created_at: string
}

// ---- API functions ----

export function syncAppstore(): Promise<string> {
  return __TAURI_INVOKE('sync_appstore')
}

export function listApps(): Promise<AppListItem[]> {
  return __TAURI_INVOKE('list_apps')
}

export function getAppDetail(appKey: string): Promise<AppDetail> {
  return __TAURI_INVOKE('get_app_detail', { appKey })
}

export function installApp(
  serverId: string,
  req: InstallAppRequest,
): Promise<InstalledApp> {
  return __TAURI_INVOKE('install_app', { serverId, req })
}

export function uninstallApp(installId: string): Promise<void> {
  return __TAURI_INVOKE('uninstall_app', { installId })
}

export function listInstalledApps(serverId?: string): Promise<InstalledApp[]> {
  return __TAURI_INVOKE('list_installed_apps', { serverId: serverId ?? null })
}

export function operateInstalledApp(
  installId: string,
  operation: string,
): Promise<string> {
  return __TAURI_INVOKE('operate_installed_app', { installId, operation })
}

export function getInstalledAppStatus(installId: string): Promise<string> {
  return __TAURI_INVOKE('get_installed_app_status', { installId })
}

// ---- React Query hooks ----

export function useAppStoreSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: syncAppstore,
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: qk.apps() })
      toast.success(msg)
    },
    onError: (err) => toast.error(String(err)),
  })
}

export function useApps() {
  return useQuery({
    queryKey: qk.apps(),
    queryFn: listApps,
    placeholderData: [] as AppListItem[],
  })
}

export function useAppDetail(appKey: string | null) {
  return useQuery({
    queryKey: qk.appDetail(appKey),
    queryFn: () => getAppDetail(appKey!),
    enabled: !!appKey,
  })
}

export function useInstallApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { serverId: string; req: InstallAppRequest }) =>
      installApp(params.serverId, params.req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.apps() })
      qc.invalidateQueries({ queryKey: qk.installedApps() })
      toast.success('应用安装成功')
    },
    onError: (err) => toast.error(String(err)),
  })
}

export function useUninstallApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: uninstallApp,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.apps() })
      qc.invalidateQueries({ queryKey: qk.installedApps() })
      toast.success('应用已卸载')
    },
    onError: (err) => toast.error(String(err)),
  })
}

export function useInstalledApps(serverId?: string) {
  return useQuery({
    queryKey: qk.installedApps(serverId),
    queryFn: () => listInstalledApps(serverId),
    placeholderData: [] as InstalledApp[],
  })
}

export function useOperateInstalledApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { installId: string; operation: string }) =>
      operateInstalledApp(params.installId, params.operation),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.installedApps() })
      toast.success('操作成功')
    },
    onError: (err) => toast.error(String(err)),
  })
}
