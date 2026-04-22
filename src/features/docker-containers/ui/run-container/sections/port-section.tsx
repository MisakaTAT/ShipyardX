import { Plus, Trash2 } from 'lucide-react'
import { Controller, useFieldArray, type Control } from 'react-hook-form'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { FieldDescription, FieldTitle } from '@/shared/ui/field'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type { RunContainerFormValues } from '@/features/docker-containers/model/run-container-schema'

interface PortSectionProps {
  control: Control<RunContainerFormValues>
}

function emptyPort(): RunContainerFormValues['ports'][number] {
  return { containerPort: 80, hostPort: null, protocol: 'tcp' }
}

export function PortSection({ control }: PortSectionProps) {
  const { fields: portFields, append, remove } = useFieldArray({ control, name: 'ports' })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldTitle>端口</FieldTitle>
        <Button type="button" variant="ghost" className="gap-1 px-2" onClick={() => append(emptyPort())}>
          <Plus className="size-3" />
          添加映射
        </Button>
      </div>
      <Controller
        control={control}
        name="publishAllPorts"
        render={({ field }) => (
          <RadioGroup
            value={field.value ? 'all' : 'mapped'}
            onValueChange={(v) => field.onChange(v === 'all')}
            className="flex flex-col gap-2"
            aria-label="端口映射方式"
          >
            <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
              <RadioGroupItem value="mapped" id="run-port-mode-mapped" />
              <span>自定义主机与容器端口</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
              <RadioGroupItem value="all" id="run-port-mode-all" />
              <span>映射镜像中 EXPOSE 的全部端口（-P）</span>
            </label>
          </RadioGroup>
        )}
      />
      <FieldDescription>可与下方映射同时使用 启用 -P 时为 Dockerfile 中 EXPOSE 端口在主机分配临时端口</FieldDescription>
      {portFields.length === 0 ? (
        <FieldDescription>未添加映射且未启用 -P 时容器内端口不会暴露到主机</FieldDescription>
      ) : (
        <div className="space-y-2">
          {portFields.map((row, i) => (
            <div key={row.id} className="flex flex-row items-center gap-2 rounded-lg border border-border bg-muted p-2">
              <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
                <Controller
                  control={control}
                  name={`ports.${i}.hostPort`}
                  render={({ field, fieldState }) => (
                    <Input
                      type="number"
                      min={0}
                      max={65535}
                      placeholder="主机端口（留空随机分配）"
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
                      placeholder="容器端口（必填）"
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
                      <SelectTrigger aria-label="协议" aria-invalid={fieldState.invalid} className="w-full min-w-0">
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
                onClick={() => remove(i)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
