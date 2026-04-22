import { Controller, type Control } from 'react-hook-form'
import { Input } from '@/shared/ui/input'
import { Field, FieldDescription, FieldLabel, FieldTitle } from '@/shared/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type { Network } from '@/types/app-bindings'
import type { RunContainerFormValues } from '@/features/docker-containers/model/run-container-schema'

interface NetworkSectionProps {
  control: Control<RunContainerFormValues>
  networks: Network[]
  networksLoading: boolean
}

const BUILT_IN = new Set(['bridge', 'host', 'none', 'default'])

export function NetworkSection({ control, networks, networksLoading }: NetworkSectionProps) {
  return (
    <div className="space-y-2">
      <Controller
        control={control}
        name="network"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-2">
            <FieldTitle>网络</FieldTitle>
            <Select value={field.value.trim() || 'bridge'} onValueChange={field.onChange} disabled={networksLoading}>
              <SelectTrigger aria-invalid={fieldState.invalid}>
                <SelectValue placeholder={networksLoading ? '正在加载网络…' : '选择网络'} />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="bridge">bridge</SelectItem>
                <SelectItem value="host">host</SelectItem>
                <SelectItem value="none">none</SelectItem>
                {networks
                  .filter((n) => !BUILT_IN.has(n.name.toLowerCase()))
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
      <FieldDescription>固定 IP 仅适用于用户自定义网络 填写 IP 后请在网络下拉选择对应名称</FieldDescription>
      <div className="grid grid-cols-2 gap-3">
        <Controller
          control={control}
          name="ipv4Address"
          render={({ field, fieldState }) => (
            <div className="space-y-2">
              <FieldLabel htmlFor="run-ctr-ipv4">IPv4</FieldLabel>
              <Input id="run-ctr-ipv4" {...field} placeholder="留空则自动分配" aria-invalid={fieldState.invalid} />
            </div>
          )}
        />
        <Controller
          control={control}
          name="ipv6Address"
          render={({ field, fieldState }) => (
            <div className="space-y-2">
              <FieldLabel htmlFor="run-ctr-ipv6">IPv6</FieldLabel>
              <Input id="run-ctr-ipv6" {...field} placeholder="留空则自动分配" aria-invalid={fieldState.invalid} />
            </div>
          )}
        />
      </div>
    </div>
  )
}
