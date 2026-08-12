import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { getName, getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ChevronRight } from 'lucide-react'
import { SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
import { toast } from '@/shared/components/toast'
import { getErrorDescription, getErrorMessage } from '@/shared/lib/errors'

interface AppMetadata {
  name: string
  version: string
}

const ABOUT_ACTIONS = [
  {
    labelKey: 'settings.about.releaseNotes',
    descKey: 'settings.about.releaseNotesDesc',
    href: 'https://github.com/MisakaTAT/ShipyardX/releases',
  },
  {
    labelKey: 'settings.about.website',
    descKey: 'settings.about.websiteDesc',
    href: 'https://github.com/MisakaTAT/ShipyardX',
  },
  {
    labelKey: 'settings.about.feedback',
    descKey: 'settings.about.feedbackDesc',
    href: 'https://github.com/MisakaTAT/ShipyardX/issues',
  },
  {
    labelKey: 'settings.about.sourceCode',
    descKey: 'settings.about.sourceCodeDesc',
    href: 'https://github.com/MisakaTAT/ShipyardX',
  },
  {
    labelKey: 'settings.about.contributors',
    descKey: 'settings.about.contributorsDesc',
    href: 'https://github.com/MisakaTAT/ShipyardX/graphs/contributors',
  },
] as const

const AUTHOR = 'MisakaTAT'
const AUTHOR_URL = 'https://github.com/MisakaTAT'

export function AboutSettingsPanel() {
  const { t } = useTranslation()
  const startYear = 2026
  const currentYear = new Date().getFullYear()
  const copyrightYears = currentYear > startYear ? `${startYear}-${currentYear}` : String(startYear)
  const [appMetadata, setAppMetadata] = useState<AppMetadata | null>(null)

  useEffect(() => {
    let cancelled = false

    void Promise.all([getName(), getVersion()])
      .then(([name, version]) => {
        if (cancelled) return
        setAppMetadata({ name, version })
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(getErrorMessage(error, t('settings.about.toastMetadataFailed')), {
          description: getErrorDescription(error, t('settings.about.toastMetadataFailed')),
        })
      })

    return () => {
      cancelled = true
    }
  }, [t])

  const openExternal = async (href: string) => {
    try {
      await openUrl(href)
    } catch (error) {
      toast.error(getErrorMessage(error, t('settings.about.toastOpenLinkFailed')), {
        description: getErrorDescription(error),
      })
    }
  }

  return (
    <SettingsPanelShell>
      <div className="flex items-center gap-4 px-3 py-2">
        <img src="/logo.png" alt="ShipyardX logo" className="size-24" />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-foreground">{appMetadata?.name ?? 'ShipyardX'}</div>
          <p className="text-xs leading-5 text-muted-foreground">{t('settings.about.description')}</p>
          <p className="text-xs text-muted-foreground">
            <Trans
              i18nKey="settings.about.copyright"
              values={{ years: copyrightYears, author: AUTHOR }}
              components={[
                <button
                  key="author"
                  type="button"
                  className="text-foreground underline-offset-4 hover:underline"
                  onClick={() => void openExternal(AUTHOR_URL)}
                />,
              ]}
            />
          </p>
        </div>
      </div>

      <div className="mt-5 divide-y divide-border/50">
        {ABOUT_ACTIONS.map((item) => (
          <button
            key={item.labelKey}
            type="button"
            onClick={() => void openExternal(item.href)}
            className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/20"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{t(item.labelKey)}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{t(item.descKey)}</div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </SettingsPanelShell>
  )
}
