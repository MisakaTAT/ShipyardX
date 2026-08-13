import { useCallback, useEffect, useId, useMemo, type ComponentProps, type ReactNode } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Box, Play, Plus, Trash2 } from 'lucide-react'
import { useImages } from '@/features/docker-images/api/use-images'
import { useNetworks } from '@/features/docker-networks/api/use-networks'
import {
  runContainerFormDefaultValues,
  runContainerFormSchema,
  runFormValuesToBuildArgs,
  type RunContainerFormValues,
} from '@/features/docker-containers/model/run-container-schema'
import { buildRunParamsFromForm } from '@/features/docker-containers/lib/docker-run-cli'
import { listSelectableImageRefs } from '@/shared/lib/docker-image-ref'
import { FormFieldRow } from '@/shared/components/form-field'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { createToastFormSubmit } from '@/shared/lib/form-error-toast'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'
import { cn } from '@/shared/lib/utils'
import { PullProgress } from '@/features/docker-containers/ui/run-container/pull-progress'
import { useRunContainerFlow } from '@/features/docker-containers/ui/run-container/use-run-container'
import { toastAppError } from '@/shared/lib/errors'

const SECTION_SHELL = 'space-y-2.5'
const SECTION_TITLE = 'text-sm font-semibold tracking-tight'
const SECTION_HINT = 'text-xs leading-relaxed'
const FIELD_SHELL = 'space-y-1.5'
const CHECK_ROW = 'flex cursor-pointer items-center gap-2.5 text-left text-[13px] leading-none text-foreground'
const RADIO_ROW = 'flex cursor-pointer items-center gap-2 text-[13px] text-foreground'

const RESTART_OPTIONS = [
  { value: 'no', labelKey: 'ui.run.policyNo' },
  { value: 'always', labelKey: 'ui.run.policyAlways' },
  { value: 'unless-stopped', labelKey: 'ui.run.policyUnlessStopped' },
  { value: 'on-failure', labelKey: 'ui.run.policyOnFailure' },
] as const

const BUILT_IN_NETWORKS = new Set(['bridge', 'host', 'none', 'default'])

function emptyKeyValueRow() {
  return { key: '', value: '' }
}

function emptyArgRow() {
  return { value: '' }
}

function emptyPort(): RunContainerFormValues['ports'][number] {
  return { containerPort: 80, hostPort: null, protocol: 'tcp' }
}

function emptyVolume(): RunContainerFormValues['volumes'][number] {
  return { hostPath: '', containerPath: '', readOnly: false }
}

function getRestartPolicyLabel(t: TFunction, value: RunContainerFormValues['restartPolicy']) {
  const option = RESTART_OPTIONS.find((o) => o.value === value)
  return option ? t(option.labelKey) : value
}

function SectionTitle({ className, invalid, ...props }: ComponentProps<typeof FieldTitle> & { invalid?: boolean }) {
  return <FieldTitle className={cn(SECTION_TITLE, invalid ? 'text-destructive' : null, className)} {...props} />
}

function SectionHint({ className, ...props }: ComponentProps<typeof FieldDescription>) {
  return <FieldDescription className={cn(SECTION_HINT, className)} {...props} />
}

interface FormSectionProps {
  title?: ReactNode
  invalid?: boolean
  action?: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}

function FormSection({ title, invalid, action, hint, children, className }: FormSectionProps) {
  return (
    <div className={cn(SECTION_SHELL, className)}>
      {title ? (
        <div className="flex items-center justify-between gap-3">
          <SectionTitle invalid={invalid}>{title}</SectionTitle>
          {action}
        </div>
      ) : null}
      {hint ? <SectionHint className="nth-last-2:mt-0">{hint}</SectionHint> : null}
      {children}
    </div>
  )
}

interface StackFieldProps {
  label: ReactNode
  htmlFor?: string
  invalid?: boolean
  hint?: ReactNode
  children: ReactNode
  className?: string
}

function StackField({ label, htmlFor, invalid, hint, children, className }: StackFieldProps) {
  return (
    <div className={cn(FIELD_SHELL, className)}>
      <FieldLabel htmlFor={htmlFor} className={invalid ? 'text-destructive' : undefined}>
        {label}
      </FieldLabel>
      {children}
      {hint ? <SectionHint>{hint}</SectionHint> : null}
    </div>
  )
}

interface CheckRowProps {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  children: ReactNode
}

function CheckRow({ checked, onCheckedChange, children }: CheckRowProps) {
  return (
    <label className={CHECK_ROW}>
      <Checkbox checked={checked} onCheckedChange={(c) => onCheckedChange(c === true)} />
      <span>{children}</span>
    </label>
  )
}

interface KeyValueEditorProps {
  title: string
  hint: ReactNode
  fields: Array<{ id: string }>
  invalid?: boolean
  onAdd: () => void
  onRemove: (index: number) => void
  renderKeyInput: (index: number) => ReactNode
  renderValueInput: (index: number) => ReactNode
}

function KeyValueEditor({
  title,
  hint,
  fields,
  invalid,
  onAdd,
  onRemove,
  renderKeyInput,
  renderValueInput,
}: KeyValueEditorProps) {
  const { t } = useTranslation()
  return (
    <FormSection
      title={title}
      invalid={invalid}
      action={
        <Button type="button" variant="outline" size="sm" className="gap-1 px-2" onClick={onAdd}>
          <Plus className="size-3" />
          {t('ui.run.addEntry')}
        </Button>
      }
      hint={hint}
    >
      {fields.length === 0 ? (
        <SectionHint>{t('ui.run.noEntries')}</SectionHint>
      ) : (
        <div className="space-y-2">
          {fields.map((row, i) => (
            <div key={row.id} className="flex flex-row items-center gap-2 rounded-lg border border-border p-1">
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                {renderKeyInput(i)}
                {renderValueInput(i)}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground hover:text-red-500"
                onClick={() => onRemove(i)}
                aria-label={t('ui.run.removeEntry', { section: title, index: String(i + 1) })}
                title={t('ui.run.removeEntry', { section: title, index: String(i + 1) })}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </FormSection>
  )
}

interface ArgListEditorProps {
  title: string
  hint: ReactNode
  mode: 'raw' | 'args'
  onModeChange: (mode: 'raw' | 'args') => void
  rawValue: string
  onRawChange: (value: string) => void
  rawPlaceholder: string
  fields: Array<{ id: string }>
  onAddArg: () => void
  onRemoveArg: (index: number) => void
  renderArgInput: (index: number) => ReactNode
}

function ArgListEditor({
  title,
  hint,
  mode,
  onModeChange,
  rawValue,
  onRawChange,
  rawPlaceholder,
  fields,
  onAddArg,
  onRemoveArg,
  renderArgInput,
}: ArgListEditorProps) {
  const { t } = useTranslation()
  return (
    <FormSection title={title} hint={hint}>
      <RadioGroup value={mode} onValueChange={(value) => onModeChange(value as 'raw' | 'args')} className="flex gap-4">
        <label className={RADIO_ROW}>
          <RadioGroupItem value="raw" />
          <span>{t('ui.run.rawCommand')}</span>
        </label>
        <label className={RADIO_ROW}>
          <RadioGroupItem value="args" />
          <span>{t('ui.run.argList')}</span>
        </label>
      </RadioGroup>
      {mode === 'raw' ? (
        <Textarea
          value={rawValue}
          onChange={(e) => onRawChange(e.target.value)}
          placeholder={rawPlaceholder}
          rows={3}
        />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <FieldLabel>{t('ui.run.argList')}</FieldLabel>
            <Button type="button" variant="outline" size="sm" className="gap-1 px-2" onClick={onAddArg}>
              <Plus className="size-3" />
              {t('ui.run.addArg')}
            </Button>
          </div>
          {fields.length === 0 ? (
            <SectionHint>{t('ui.run.noArgs')}</SectionHint>
          ) : (
            <div className="space-y-2">
              {fields.map((row, i) => (
                <div key={row.id} className="flex items-center gap-2 rounded-lg border border-border p-1">
                  <div className="min-w-0 flex-1">{renderArgInput(i)}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-red-500"
                    onClick={() => onRemoveArg(i)}
                    aria-label={t('ui.run.removeArg', { section: title, index: String(i + 1) })}
                    title={t('ui.run.removeArg', { section: title, index: String(i + 1) })}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </FormSection>
  )
}

interface RunContainerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverId: string
  onSuccess?: () => void
}

export default function RunContainerDialog({ open, onOpenChange, serverId, onSuccess }: RunContainerDialogProps) {
  const { t } = useTranslation()
  const imagesQuery = useImages(serverId, open)
  const networksQuery = useNetworks(serverId, open)
  const images = useMemo(() => imagesQuery.data ?? [], [imagesQuery.data])
  const networks = networksQuery.data ?? []
  const imagesLoading = imagesQuery.isPending
  const networksLoading = networksQuery.isPending
  const imageDatalistId = useId()

  const form = useForm<RunContainerFormValues>({
    resolver: zodResolver(runContainerFormSchema),
    defaultValues: runContainerFormDefaultValues,
    mode: 'onSubmit',
  })

  const {
    control,
    watch,
    getValues,
    setValue,
    formState: { errors },
    reset: resetForm,
  } = form

  const { fields: portFields, append: appendPort, remove: removePort } = useFieldArray({ control, name: 'ports' })
  const {
    fields: volumeFields,
    append: appendVolume,
    remove: removeVolume,
  } = useFieldArray({ control, name: 'volumes' })
  const { fields: envFields, append: appendEnv, remove: removeEnv } = useFieldArray({ control, name: 'envEntries' })
  const {
    fields: labelFields,
    append: appendLabel,
    remove: removeLabel,
  } = useFieldArray({ control, name: 'labelEntries' })
  const {
    fields: commandArgFields,
    append: appendCommandArg,
    remove: removeCommandArg,
  } = useFieldArray({ control, name: 'commandArgs' })
  const {
    fields: entrypointArgFields,
    append: appendEntrypointArg,
    remove: removeEntrypointArg,
  } = useFieldArray({ control, name: 'entrypointArgs' })

  const restartPolicy = watch('restartPolicy')
  const network = watch('network')
  const commandMode = watch('commandMode')
  const commandText = watch('commandText')
  const entrypointMode = watch('entrypointMode')
  const entrypointText = watch('entrypointText')
  const imageInvalid = !!errors.image
  const isCustomNetwork = Boolean(network.trim()) && !BUILT_IN_NETWORKS.has(network.trim().toLowerCase())

  const handleSuccess = useCallback(() => {
    onSuccess?.()
    onOpenChange(false)
  }, [onSuccess, onOpenChange])

  const flow = useRunContainerFlow(serverId, handleSuccess)

  useEffect(() => {
    if (!open) return
    flow.reset()
    resetForm(runContainerFormDefaultValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, serverId])

  useEffect(() => {
    if (imagesQuery.error) toastAppError(imagesQuery.error, t('ui.run.loadImagesFailed'))
  }, [t, imagesQuery.error])

  useEffect(() => {
    if (networksQuery.error) toastAppError(networksQuery.error, t('ui.run.loadNetworksFailed'))
  }, [t, networksQuery.error])

  const imageOptions = useMemo(() => listSelectableImageRefs(images), [images])

  const onSubmit = useCallback(
    (data: RunContainerFormValues) => {
      try {
        const params = buildRunParamsFromForm(runFormValuesToBuildArgs(data))
        flow.submit(params, data.forcePull, images)
      } catch (e) {
        toastAppError(e)
      }
    },
    [flow, images]
  )

  const submitWithToast = createToastFormSubmit(
    form,
    async (values) => {
      onSubmit(values)
    },
    t('ui.run.submitFailed')
  )

  const progressSteps = [
    {
      status: flow.imageStep,
      title: flow.imageStepTitle || t('ui.run.imageStep'),
      detail: flow.imageStepDetail || undefined,
    },
    {
      status: flow.runStep,
      title: t('ui.run.createStep'),
      detail: flow.runStep === 'active' ? t('ui.run.createStepDetail') : undefined,
    },
  ]

  const showForm = flow.phase === 'form'
  const disableClose = flow.phase === 'progress' && flow.isStepActive

  return (
    <StandardDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
      }}
      title={t('ui.run.title')}
      icon={Box}
      widthClassName="w-[680px]"
      disableClose={disableClose}
      showCloseButton={showForm}
      headerActions={
        showForm ? null : (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            disabled={flow.runStep === 'active'}
            onClick={() => void flow.handleBackFromProgress()}
          >
            {flow.imageStep === 'active' ? t('ui.run.abortPull') : t('ui.run.backToEdit')}
          </Button>
        )
      }
      footer={
        showForm ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('ui.common.cancel')}
            </Button>
            <Button type="submit" form="run-container-builder-form" className="gap-1.5" disabled={imagesLoading}>
              <Play />
              {t('ui.run.run')}
            </Button>
          </div>
        ) : null
      }
    >
      {showForm ? (
        <form id="run-container-builder-form" className="space-y-7" onSubmit={submitWithToast} noValidate>
          <FieldGroup>
            {/* 基础：名称 + 镜像 */}
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState }) => (
                <FormFieldRow
                  label={t('ui.run.containerName')}
                  htmlFor="run-ctr-name"
                  required
                  invalid={fieldState.invalid}
                  description={<SectionHint>{t('ui.run.nameHint')}</SectionHint>}
                >
                  <Input
                    id="run-ctr-name"
                    {...field}
                    placeholder={t('ui.run.namePlaceholder')}
                    aria-invalid={fieldState.invalid}
                  />
                </FormFieldRow>
              )}
            />

            <Controller
              control={control}
              name="imageManualInput"
              render={({ field: manualField }) => (
                <Controller
                  control={control}
                  name="image"
                  render={({ field: imageField, fieldState }) => (
                    <FormFieldRow
                      label={t('ui.run.image')}
                      required
                      invalid={fieldState.invalid || imageInvalid}
                      variant="title"
                      className={SECTION_SHELL}
                      contentClassName="gap-2"
                      labelClassName={cn(SECTION_TITLE, fieldState.invalid || imageInvalid ? 'text-destructive' : null)}
                      description={
                        manualField.value ? (
                          <SectionHint>{t('ui.run.imageHint')}</SectionHint>
                        ) : !imagesLoading && imageOptions.length === 0 ? (
                          <SectionHint>{t('ui.run.imageEmptyHint')}</SectionHint>
                        ) : undefined
                      }
                    >
                      <div className="flex items-center gap-2">
                        <Select
                          value={manualField.value ? 'manual' : 'list'}
                          onValueChange={(v) => {
                            const nextManual = v === 'manual'
                            manualField.onChange(nextManual)
                            if (nextManual) return
                            const cur = getValues('image')
                            if (cur && !imageOptions.includes(cur)) setValue('image', '')
                          }}
                          disabled={imagesLoading}
                        >
                          <SelectTrigger aria-invalid={fieldState.invalid || imageInvalid} className="w-32 shrink-0">
                            <SelectValue>
                              {(v) =>
                                v === 'manual'
                                  ? t('ui.run.imageModeManual')
                                  : v === 'list'
                                    ? t('ui.run.imageModeList')
                                    : v
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent align="start">
                            <SelectItem value="manual">{t('ui.run.imageModeManual')}</SelectItem>
                            <SelectItem value="list" disabled={imageOptions.length === 0}>
                              {t('ui.run.imageModeList')}
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        {manualField.value ? (
                          <>
                            <Input
                              {...imageField}
                              list={imageDatalistId}
                              placeholder={
                                imagesLoading ? t('ui.run.imageLoadingPlaceholder') : t('ui.run.imagePlaceholder')
                              }
                              disabled={imagesLoading}
                              autoComplete="off"
                              aria-invalid={fieldState.invalid}
                              className="min-w-0 flex-1"
                            />
                            <datalist id={imageDatalistId}>
                              {imageOptions.map((ref) => (
                                <option key={ref} value={ref} />
                              ))}
                            </datalist>
                          </>
                        ) : (
                          <Select
                            value={
                              imageField.value && imageOptions.includes(imageField.value) ? imageField.value : undefined
                            }
                            onValueChange={imageField.onChange}
                            disabled={imagesLoading || imageOptions.length === 0}
                          >
                            <SelectTrigger aria-invalid={fieldState.invalid} className="min-w-0 flex-1">
                              <SelectValue
                                placeholder={
                                  imagesLoading
                                    ? t('ui.run.loading')
                                    : imageOptions.length === 0
                                      ? t('ui.run.noLocalImages')
                                      : t('ui.run.selectImage')
                                }
                              />
                            </SelectTrigger>
                            <SelectContent align="start">
                              {imageOptions.map((ref) => (
                                <SelectItem key={ref} value={ref}>
                                  {ref}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </FormFieldRow>
                  )}
                />
              )}
            />
            <FormSection>
              <Controller
                control={control}
                name="forcePull"
                render={({ field }) => (
                  <>
                    <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                      {t('ui.run.alwaysPull')}
                    </CheckRow>
                    <SectionHint>{t('ui.run.alwaysPullHint')}</SectionHint>
                  </>
                )}
              />
            </FormSection>

            {/* 端口 */}
            <FormSection
              title={t('ui.run.ports')}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 px-2"
                  onClick={() => appendPort(emptyPort())}
                >
                  <Plus className="size-3" />
                  {t('ui.run.addPortMapping')}
                </Button>
              }
              hint={t('ui.run.portsHint')}
            >
              <Controller
                control={control}
                name="publishAllPorts"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value ? 'all' : 'mapped'}
                    onValueChange={(v) => field.onChange(v === 'all')}
                    className="flex flex-col gap-2"
                    aria-label={t('ui.run.portModeLabel')}
                  >
                    <label className={RADIO_ROW}>
                      <RadioGroupItem value="mapped" id="run-port-mode-mapped" />
                      <span>{t('ui.run.portModeManual')}</span>
                    </label>
                    <label className={RADIO_ROW}>
                      <RadioGroupItem value="all" id="run-port-mode-all" />
                      <span>{t('ui.run.portModePublishAll')}</span>
                    </label>
                  </RadioGroup>
                )}
              />
              {portFields.length === 0 ? (
                <SectionHint>{t('ui.run.portsEmptyHint')}</SectionHint>
              ) : (
                <div className="space-y-2">
                  {portFields.map((row, i) => (
                    <div key={row.id} className="flex flex-row items-center gap-2 rounded-lg border border-border p-1">
                      <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
                        <Controller
                          control={control}
                          name={`ports.${i}.hostPort`}
                          render={({ field, fieldState }) => (
                            <Input
                              type="number"
                              min={0}
                              max={65535}
                              placeholder={t('ui.run.hostPortPlaceholder')}
                              value={field.value == null || field.value === 0 ? '' : field.value}
                              onChange={(e) => {
                                const t = e.target.value
                                if (t === '') {
                                  field.onChange(null)
                                  return
                                }
                                const n = parseInt(t, 10)
                                field.onChange(Number.isFinite(n) ? n : null)
                              }}
                              aria-invalid={fieldState.invalid}
                            />
                          )}
                        />
                        <Controller
                          control={control}
                          name={`ports.${i}.containerPort`}
                          render={({ field, fieldState }) => (
                            <Input
                              type="number"
                              min={1}
                              max={65535}
                              placeholder={t('ui.run.containerPortPlaceholder')}
                              value={field.value || ''}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10)
                                field.onChange(Number.isFinite(v) ? v : 0)
                              }}
                              aria-invalid={fieldState.invalid}
                            />
                          )}
                        />
                        <Controller
                          control={control}
                          name={`ports.${i}.protocol`}
                          render={({ field, fieldState }) => (
                            <Select value={field.value || 'tcp'} onValueChange={field.onChange}>
                              <SelectTrigger
                                aria-label={t('ui.run.protocol')}
                                aria-invalid={fieldState.invalid}
                                className="w-full min-w-0"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent align="start">
                                <SelectItem value="tcp">tcp</SelectItem>
                                <SelectItem value="udp">udp</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-muted-foreground hover:text-red-500"
                        onClick={() => removePort(i)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </FormSection>

            {/* 网络 */}
            <FormSection
              title={t('ui.run.network')}
              hint={isCustomNetwork ? t('ui.run.networkCustomHint') : t('ui.run.networkDefaultHint')}
            >
              <Controller
                control={control}
                name="network"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    <Select
                      value={field.value.trim() || 'bridge'}
                      onValueChange={field.onChange}
                      disabled={networksLoading}
                    >
                      <SelectTrigger aria-invalid={fieldState.invalid}>
                        <SelectValue
                          placeholder={networksLoading ? t('ui.run.networkLoading') : t('ui.run.selectNetwork')}
                        />
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectItem value="bridge">bridge</SelectItem>
                        <SelectItem value="host">host</SelectItem>
                        <SelectItem value="none">none</SelectItem>
                        {networks
                          .filter((n) => !BUILT_IN_NETWORKS.has(n.name.toLowerCase()))
                          .map((n) => (
                            <SelectItem key={n.id} value={n.name}>
                              {n.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <Controller
                  control={control}
                  name="ipv4Address"
                  render={({ field, fieldState }) => (
                    <StackField label="IPv4" htmlFor="run-ctr-ipv4" invalid={fieldState.invalid}>
                      <Input
                        id="run-ctr-ipv4"
                        {...field}
                        placeholder={t('ui.run.autoAssign')}
                        aria-invalid={fieldState.invalid}
                      />
                    </StackField>
                  )}
                />
                <Controller
                  control={control}
                  name="ipv6Address"
                  render={({ field, fieldState }) => (
                    <StackField label="IPv6" htmlFor="run-ctr-ipv6" invalid={fieldState.invalid}>
                      <Input
                        id="run-ctr-ipv6"
                        {...field}
                        placeholder={t('ui.run.autoAssign')}
                        aria-invalid={fieldState.invalid}
                      />
                    </StackField>
                  )}
                />
              </div>
            </FormSection>

            {/* 数据卷 */}
            <FormSection
              title={t('ui.run.volumes')}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 px-2"
                  onClick={() => appendVolume(emptyVolume())}
                >
                  <Plus className="size-3" />
                  {t('ui.run.addMount')}
                </Button>
              }
              hint={t('ui.run.volumesHint')}
            >
              {volumeFields.map((row, i) => (
                <div key={row.id} className="flex flex-row items-center gap-2 rounded-lg border border-border p-1">
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                    <Controller
                      control={control}
                      name={`volumes.${i}.hostPath`}
                      render={({ field, fieldState }) => (
                        <Input
                          placeholder={t('ui.run.hostPathPlaceholder')}
                          {...field}
                          aria-invalid={fieldState.invalid}
                        />
                      )}
                    />
                    <Controller
                      control={control}
                      name={`volumes.${i}.containerPath`}
                      render={({ field, fieldState }) => (
                        <Input
                          placeholder={t('ui.run.containerPathPlaceholder')}
                          {...field}
                          aria-invalid={fieldState.invalid}
                        />
                      )}
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Controller
                      control={control}
                      name={`volumes.${i}.readOnly`}
                      render={({ field }) => (
                        <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                          {t('ui.run.readOnly')}
                        </CheckRow>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-red-500"
                      onClick={() => removeVolume(i)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </FormSection>

            {/* 启动命令 & 入口 */}
            <ArgListEditor
              title={t('ui.run.cmdTitle')}
              mode={commandMode}
              onModeChange={(mode) => setValue('commandMode', mode)}
              rawValue={commandText}
              onRawChange={(value) => setValue('commandText', value)}
              rawPlaceholder={t('ui.run.cmdPlaceholder')}
              hint={t('ui.run.cmdHint')}
              fields={commandArgFields}
              onAddArg={() => appendCommandArg(emptyArgRow())}
              onRemoveArg={removeCommandArg}
              renderArgInput={(index) => (
                <Controller
                  control={control}
                  name={`commandArgs.${index}.value`}
                  render={({ field, fieldState }) => (
                    <Input
                      {...field}
                      placeholder={index === 0 ? t('ui.run.cmdArg0') : t('ui.run.cmdArgN')}
                      aria-invalid={fieldState.invalid}
                    />
                  )}
                />
              )}
            />

            <ArgListEditor
              title={t('ui.run.entrypointTitle')}
              mode={entrypointMode}
              onModeChange={(mode) => setValue('entrypointMode', mode)}
              rawValue={entrypointText}
              onRawChange={(value) => setValue('entrypointText', value)}
              rawPlaceholder={t('ui.run.entrypointPlaceholder')}
              hint={t('ui.run.entrypointHint')}
              fields={entrypointArgFields}
              onAddArg={() => appendEntrypointArg(emptyArgRow())}
              onRemoveArg={removeEntrypointArg}
              renderArgInput={(index) => (
                <Controller
                  control={control}
                  name={`entrypointArgs.${index}.value`}
                  render={({ field, fieldState }) => (
                    <Input
                      {...field}
                      placeholder={index === 0 ? t('ui.run.entrypointArg0') : t('ui.run.entrypointArgN')}
                      aria-invalid={fieldState.invalid}
                    />
                  )}
                />
              )}
            />

            {/* 标签 & 环境变量 */}
            <KeyValueEditor
              title={t('ui.run.labelsTitle')}
              hint={t('ui.run.labelsHint')}
              fields={labelFields}
              invalid={Boolean(errors.labelEntries)}
              onAdd={() => appendLabel(emptyKeyValueRow())}
              onRemove={removeLabel}
              renderKeyInput={(index) => (
                <Controller
                  control={control}
                  name={`labelEntries.${index}.key`}
                  render={({ field, fieldState }) => (
                    <Input {...field} placeholder="app" aria-invalid={fieldState.invalid} />
                  )}
                />
              )}
              renderValueInput={(index) => (
                <Controller
                  control={control}
                  name={`labelEntries.${index}.value`}
                  render={({ field, fieldState }) => (
                    <Input {...field} placeholder="shipyardx" aria-invalid={fieldState.invalid} />
                  )}
                />
              )}
            />

            <KeyValueEditor
              title={t('ui.run.envTitle')}
              hint={t('ui.run.envHint')}
              fields={envFields}
              invalid={Boolean(errors.envEntries)}
              onAdd={() => appendEnv(emptyKeyValueRow())}
              onRemove={removeEnv}
              renderKeyInput={(index) => (
                <Controller
                  control={control}
                  name={`envEntries.${index}.key`}
                  render={({ field, fieldState }) => (
                    <Input {...field} placeholder="TZ" aria-invalid={fieldState.invalid} />
                  )}
                />
              )}
              renderValueInput={(index) => (
                <Controller
                  control={control}
                  name={`envEntries.${index}.value`}
                  render={({ field, fieldState }) => (
                    <Input {...field} placeholder="Asia/Shanghai" aria-invalid={fieldState.invalid} />
                  )}
                />
              )}
            />

            {/* 资源限制 */}
            <FormSection title={t('ui.run.resourcesTitle')} hint={t('ui.run.resourcesHint')}>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setValue('cpuQuotaCores', '0.5')}>
                  {t('ui.run.halfCore')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setValue('cpuQuotaCores', '1')}>
                  {t('ui.run.oneCore')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setValue('memoryMb', '512')}>
                  512 MB
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setValue('memoryMb', '1024')}>
                  1 GB
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Controller
                  control={control}
                  name="cpuShares"
                  render={({ field, fieldState }) => (
                    <StackField label={t('ui.run.cpuShares')} htmlFor="run-cpu-shares" invalid={fieldState.invalid}>
                      <Input
                        id="run-cpu-shares"
                        type="number"
                        min={0}
                        {...field}
                        placeholder={t('ui.run.cpuSharesPlaceholder')}
                        aria-invalid={fieldState.invalid}
                      />
                    </StackField>
                  )}
                />
                <Controller
                  control={control}
                  name="cpuQuotaCores"
                  render={({ field, fieldState }) => (
                    <StackField label={t('ui.run.cpuQuota')} htmlFor="run-cpu-quota" invalid={fieldState.invalid}>
                      <Input
                        id="run-cpu-quota"
                        type="number"
                        min={0}
                        step="0.1"
                        {...field}
                        placeholder={t('ui.run.noLimitPlaceholder')}
                        aria-invalid={fieldState.invalid}
                      />
                    </StackField>
                  )}
                />
                <Controller
                  control={control}
                  name="memoryMb"
                  render={({ field, fieldState }) => (
                    <StackField label={t('ui.run.memoryLimit')} htmlFor="run-mem" invalid={fieldState.invalid}>
                      <Input
                        id="run-mem"
                        type="number"
                        min={0}
                        {...field}
                        placeholder={t('ui.run.noLimitPlaceholder')}
                        aria-invalid={fieldState.invalid}
                      />
                    </StackField>
                  )}
                />
              </div>
            </FormSection>

            {/* 其它选项 */}
            <FormSection title={t('ui.run.otherTitle')}>
              <Controller
                control={control}
                name="autoRemove"
                render={({ field }) => (
                  <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                    {t('ui.run.autoRemove')}
                  </CheckRow>
                )}
              />
              <SectionHint className="pl-6">{t('ui.run.autoRemoveHint')}</SectionHint>
              <Controller
                control={control}
                name="privileged"
                render={({ field }) => (
                  <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                    {t('ui.run.privileged')}
                  </CheckRow>
                )}
              />
              <SectionHint className="pl-6">{t('ui.run.privilegedHint')}</SectionHint>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <Controller
                  control={control}
                  name="tty"
                  render={({ field }) => (
                    <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                      {t('ui.run.tty')}
                    </CheckRow>
                  )}
                />
                <Controller
                  control={control}
                  name="openStdin"
                  render={({ field }) => (
                    <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                      {t('ui.run.stdin')}
                    </CheckRow>
                  )}
                />
              </div>
              <SectionHint className="pl-6">{t('ui.run.ttyHint')}</SectionHint>
            </FormSection>

            {/* 重启策略 */}
            <FormSection
              title={t('ui.run.restartTitle')}
              hint={
                restartPolicy === 'no'
                  ? t('ui.run.restartNoHint')
                  : restartPolicy === 'always'
                    ? t('ui.run.restartAlwaysHint')
                    : restartPolicy === 'unless-stopped'
                      ? t('ui.run.restartUnlessStoppedHint')
                      : t('ui.run.restartOnFailureHint')
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <Controller
                  control={control}
                  name="restartPolicy"
                  render={({ field, fieldState }) => (
                    <StackField label={t('ui.run.policy')} invalid={fieldState.invalid}>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger aria-invalid={fieldState.invalid} className="w-full">
                          <SelectValue>
                            {(value) => getRestartPolicyLabel(t, value as RunContainerFormValues['restartPolicy'])}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent align="start">
                          {RESTART_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {t(o.labelKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </StackField>
                  )}
                />
                {restartPolicy === 'on-failure' ? (
                  <Controller
                    control={control}
                    name="restartMaxRetry"
                    render={({ field, fieldState }) => (
                      <StackField label={t('ui.run.maxRetry')} htmlFor="run-restart-max" invalid={fieldState.invalid}>
                        <Input
                          id="run-restart-max"
                          type="number"
                          min={0}
                          {...field}
                          aria-invalid={fieldState.invalid}
                        />
                      </StackField>
                    )}
                  />
                ) : null}
              </div>
            </FormSection>
          </FieldGroup>
        </form>
      ) : (
        <PullProgress
          steps={progressSteps}
          pullProgress={flow.pullProgress}
          showPullProgress={flow.showPullProgress}
          error={flow.progressError}
        />
      )}
    </StandardDialog>
  )
}
