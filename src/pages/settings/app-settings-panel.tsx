import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getVersion } from '@tauri-apps/api/app'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type LanguageSetting } from '@/app/i18n'
import { useAppSettings } from '@/app/settings-store'
import { runThemeTransition, useTheme } from '@/app/theme'
import { SettingsActionRow, SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
import { toast } from '@/shared/components/toast'
import { formatDateTimeString } from '@/shared/lib/datetime'
import { getErrorDescription, getErrorMessage } from '@/shared/lib/errors'
import { formatBytes } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { ButtonGroup } from '@/shared/ui/button-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'latest' | 'downloading' | 'installed' | 'error'

type AppearanceTheme = 'light' | 'dark' | 'system'

const THEME_OPTIONS = [
  { value: 'light', labelKey: 'ui.settings.general.theme.light', descKey: 'ui.settings.general.theme.lightDesc' },
  { value: 'dark', labelKey: 'ui.settings.general.theme.dark', descKey: 'ui.settings.general.theme.darkDesc' },
  { value: 'system', labelKey: 'ui.settings.general.theme.system', descKey: 'ui.settings.general.theme.systemDesc' },
] as const satisfies ReadonlyArray<{ value: AppearanceTheme; labelKey: string; descKey: string }>

export function GeneralSettingsPanel() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const { settings, updateLanguage } = useAppSettings()

  const formatProgress = (downloadedBytes: number, totalBytes: number | null) => {
    if (!Number.isFinite(downloadedBytes) || downloadedBytes <= 0)
      return t('ui.settings.general.update.progressPreparing')
    if (totalBytes && Number.isFinite(totalBytes) && totalBytes > 0) {
      const progress = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
      return `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} (${progress}%)`
    }
    return t('ui.settings.general.update.progressDownloaded', { size: formatBytes(downloadedBytes) })
  }

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null)
  const [downloadedBytes, setDownloadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState<number | null>(null)
  const [currentVersion, setCurrentVersion] = useState<string>('-')

  useEffect(() => {
    return () => {
      if (!pendingUpdate) return
      void pendingUpdate.close().catch(() => undefined)
    }
  }, [pendingUpdate])

  useEffect(() => {
    let cancelled = false
    void getVersion()
      .then((version) => {
        if (!cancelled) setCurrentVersion(version)
      })
      .catch(() => {
        if (!cancelled) setCurrentVersion('-')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleCheckUpdate = async () => {
    if (pendingUpdate) {
      void pendingUpdate.close().catch(() => undefined)
    }

    setUpdateStatus('checking')
    setPendingUpdate(null)
    setDownloadedBytes(0)
    setTotalBytes(null)

    try {
      const update = await check()
      if (!update) {
        setUpdateStatus('latest')
        toast.success(t('ui.settings.general.update.toastLatest'))
        return
      }

      setPendingUpdate(update)
      setUpdateStatus('available')
      toast.info(t('ui.settings.general.update.toastFound', { version: update.version }), {
        description: update.body?.trim() || t('ui.settings.general.update.toastFoundDesc'),
      })
    } catch (error) {
      setUpdateStatus('error')
      toast.error(getErrorMessage(error, t('ui.settings.general.update.toastCheckFailed')), {
        description: getErrorDescription(error, t('ui.settings.general.update.toastCheckFailedDesc')),
      })
    }
  }

  const handleInstallUpdate = async () => {
    if (!pendingUpdate) return

    setUpdateStatus('downloading')
    setDownloadedBytes(0)
    setTotalBytes(null)

    try {
      await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          setDownloadedBytes(0)
          setTotalBytes(event.data.contentLength ?? null)
          return
        }
        if (event.event === 'Progress') {
          setDownloadedBytes((current) => current + event.data.chunkLength)
        }
      })

      setUpdateStatus('installed')
      toast.success(
        t('ui.settings.general.update.toastInstalled', { name: 'ShipyardX', version: pendingUpdate.version }),
        {
          description: t('ui.settings.general.update.toastInstalledDesc'),
        }
      )
    } catch (error) {
      setUpdateStatus('error')
      toast.error(getErrorMessage(error, t('ui.settings.general.update.toastInstallFailed')), {
        description: getErrorDescription(error, t('ui.settings.general.update.toastInstallFailedDesc')),
      })
    }
  }

  const updateDescription =
    updateStatus === 'downloading'
      ? t('ui.settings.general.update.downloadingDesc', { progress: formatProgress(downloadedBytes, totalBytes) })
      : updateStatus === 'installed'
        ? t('ui.settings.general.update.installedDesc')
        : updateStatus === 'latest'
          ? t('ui.settings.general.update.latestDesc')
          : pendingUpdate
            ? pendingUpdate.date
              ? t('ui.settings.general.update.availableDescWithDate', {
                  version: pendingUpdate.version,
                  date: formatDateTimeString(pendingUpdate.date),
                })
              : t('ui.settings.general.update.availableDesc', { version: pendingUpdate.version })
            : t('ui.settings.general.update.description')

  const updateActionLabel =
    updateStatus === 'checking'
      ? t('ui.settings.general.update.checking')
      : updateStatus === 'downloading'
        ? t('ui.settings.general.update.downloadingAction')
        : pendingUpdate
          ? t('ui.settings.general.update.install', { version: pendingUpdate.version })
          : t('ui.settings.general.update.check')

  const currentTheme = (theme ?? 'system') as AppearanceTheme
  const themeDescriptionKey =
    THEME_OPTIONS.find((option) => option.value === currentTheme)?.descKey ?? 'ui.settings.general.theme.systemDesc'
  const updateSummary =
    updateStatus === 'checking'
      ? t('ui.settings.general.version.checking')
      : updateStatus === 'downloading'
        ? t('ui.settings.general.version.downloading')
        : updateStatus === 'installed'
          ? t('ui.settings.general.version.installed')
          : updateStatus === 'available'
            ? t('ui.settings.general.version.available', { version: pendingUpdate?.version ?? '' }).trim()
            : updateStatus === 'error'
              ? t('ui.settings.general.version.error')
              : updateStatus === 'latest'
                ? t('ui.settings.general.version.latest')
                : t('ui.settings.general.version.notChecked')

  return (
    <SettingsPanelShell>
      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title={t('ui.settings.general.theme.title')}
          description={t(themeDescriptionKey)}
          action={
            <ButtonGroup className="w-full max-w-xs">
              {THEME_OPTIONS.map((option) => {
                const active = currentTheme === option.value
                return (
                  <Button
                    key={option.value}
                    type="button"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      runThemeTransition(
                        {
                          x: rect.left + rect.width / 2,
                          y: rect.top + rect.height / 2,
                        },
                        () => setTheme(option.value)
                      )
                    }}
                    variant={active ? 'default' : 'outline'}
                    className="flex-1"
                  >
                    {t(option.labelKey)}
                  </Button>
                )
              })}
            </ButtonGroup>
          }
        />

        <SettingsActionRow
          title={t('ui.settings.general.language.title')}
          description={t('ui.settings.general.language.description')}
          action={
            <div className="w-full max-w-xs">
              <Select value={settings.language} onValueChange={(value) => updateLanguage(value as LanguageSetting)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {settings.language === 'system'
                      ? t('ui.settings.general.language.system')
                      : LANGUAGE_LABELS[settings.language]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">{t('ui.settings.general.language.system')}</SelectItem>
                  {SUPPORTED_LANGUAGES.map((language) => (
                    <SelectItem key={language} value={language}>
                      {LANGUAGE_LABELS[language]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />

        <SettingsActionRow
          title={t('ui.settings.general.version.title')}
          description={updateDescription}
          action={
            <div className="w-full max-w-xs text-right">
              <div className="text-sm font-medium text-foreground">
                {t('ui.settings.general.version.current', { version: currentVersion })}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{updateSummary}</div>
            </div>
          }
        />

        <SettingsActionRow
          title={t('ui.settings.general.update.title')}
          description={t('ui.settings.general.update.description')}
          action={
            <div className="flex w-full max-w-xs justify-end">
              <Button
                variant={pendingUpdate ? 'default' : 'outline'}
                className="justify-center"
                onClick={() => void (pendingUpdate ? handleInstallUpdate() : handleCheckUpdate())}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'installed'}
              >
                {updateStatus === 'checking' || updateStatus === 'downloading' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : pendingUpdate ? (
                  <Download className="size-4" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                <span>{updateActionLabel}</span>
              </Button>
            </div>
          }
        />
      </div>
    </SettingsPanelShell>
  )
}
