import { useId } from 'react'
import { Controller, type Control } from 'react-hook-form'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from '@/shared/ui/field'
import type { RunContainerFormValues } from '@/features/docker-containers/model/run-container-schema'
import { CheckRow } from '../shared'

interface BasicSectionProps {
  control: Control<RunContainerFormValues>
  imageOptions: string[]
  imagesLoading: boolean
  onToggleManual: (on: boolean) => void
}

/**
 * 名称 + 镜像选择 + 强制拉取。
 */
export function BasicSection({ control, imageOptions, imagesLoading, onToggleManual }: BasicSectionProps) {
  const datalistId = useId()

  return (
    <>
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="run-ctr-name">容器名称</FieldLabel>
            <FieldContent>
              <Input id="run-ctr-name" {...field} placeholder="留空由 Docker 命名" />
              <FieldDescription>仅支持字母数字下划线连字符与英文句点</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </FieldContent>
          </Field>
        )}
      />

      <div className="space-y-2">
        <FieldTitle>镜像</FieldTitle>
        <Controller
          control={control}
          name="imageManualInput"
          render={({ field: manualField }) => (
            <>
              <CheckRow
                checked={manualField.value}
                onCheckedChange={(on) => {
                  manualField.onChange(on)
                  onToggleManual(on)
                }}
              >
                自定镜像
              </CheckRow>
              <Controller
                control={control}
                name="image"
                render={({ field: imageField, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    {manualField.value ? (
                      <>
                        <Input
                          {...imageField}
                          list={datalistId}
                          placeholder={
                            imagesLoading
                              ? '正在加载本地镜像…'
                              : '例如 nginx:alpine 或 registry.example.com/project:tag'
                          }
                          disabled={imagesLoading}
                          autoComplete="off"
                          className="font-mono"
                        />
                        <datalist id={datalistId}>
                          {imageOptions.map((ref) => (
                            <option key={ref} value={ref} />
                          ))}
                        </datalist>
                        <FieldDescription>
                          可联想本地列表或直接输入完整引用 本机无该标签时启动前会自动拉取
                        </FieldDescription>
                      </>
                    ) : (
                      <>
                        <Select
                          value={
                            imageField.value && imageOptions.includes(imageField.value) ? imageField.value : undefined
                          }
                          onValueChange={imageField.onChange}
                          disabled={imagesLoading || imageOptions.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                imagesLoading
                                  ? '正在加载…'
                                  : imageOptions.length === 0
                                    ? '当前无本地镜像'
                                    : '从列表选择镜像'
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
                        {!imagesLoading && imageOptions.length === 0 ? (
                          <FieldDescription>
                            可勾选自定镜像自行输入引用 或先到镜像页拉取后再选
                          </FieldDescription>
                        ) : null}
                      </>
                    )}
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </>
          )}
        />
        <Controller
          control={control}
          name="forcePull"
          render={({ field }) => (
            <>
              <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                启动前强制拉取
              </CheckRow>
              <FieldDescription>勾选后每次启动前都会执行 pull 本机已有同名标签时也可用于更新镜像</FieldDescription>
            </>
          )}
        />
      </div>
    </>
  )
}
