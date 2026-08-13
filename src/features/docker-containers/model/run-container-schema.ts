import i18n from '@/app/i18n'
import { z } from 'zod'
import {
  buildRunParamsFromForm,
  getRunContainerValidationIssues,
} from '@/features/docker-containers/lib/docker-run-cli'

const keyValueRowSchema = z.object({
  key: z.string(),
  value: z.string(),
})

const argRowSchema = z.object({
  value: z.string(),
})

export const portRowSchema = z.object({
  containerPort: z.number().int().min(1).max(65535),
  hostPort: z.number().int().min(0).max(65535).nullable(),
  protocol: z.enum(['tcp', 'udp']),
})

export const volumeRowSchema = z.object({
  hostPath: z.string(),
  containerPath: z.string(),
  readOnly: z.boolean(),
})

const runContainerFormBaseSchema = z.object({
  name: z.string(),
  image: z.string(),
  imageManualInput: z.boolean(),
  forcePull: z.boolean(),
  envEntries: z.array(keyValueRowSchema),
  labelEntries: z.array(keyValueRowSchema),
  ports: z.array(portRowSchema),
  volumes: z.array(volumeRowSchema),
  publishAllPorts: z.boolean(),
  network: z.string(),
  ipv4Address: z.string(),
  ipv6Address: z.string(),
  commandMode: z.enum(['raw', 'args']),
  commandText: z.string(),
  commandArgs: z.array(argRowSchema),
  entrypointMode: z.enum(['raw', 'args']),
  entrypointText: z.string(),
  entrypointArgs: z.array(argRowSchema),
  autoRemove: z.boolean(),
  privileged: z.boolean(),
  tty: z.boolean(),
  openStdin: z.boolean(),
  cpuShares: z.string(),
  cpuQuotaCores: z.string(),
  memoryMb: z.string(),
  restartPolicy: z.enum(['no', 'always', 'unless-stopped', 'on-failure']),
  restartMaxRetry: z.string(),
})

export type RunContainerFormValues = z.infer<typeof runContainerFormBaseSchema>

export function runFormValuesToBuildArgs(v: RunContainerFormValues) {
  return {
    image: v.image.trim(),
    name: v.name,
    envEntries: v.envEntries,
    labelEntries: v.labelEntries,
    ports: v.ports.map((p) => ({
      containerPort: p.containerPort,
      hostPort: p.hostPort,
      protocol: p.protocol,
    })),
    volumes: v.volumes.map((x) => ({
      hostPath: x.hostPath,
      containerPath: x.containerPath,
      readOnly: x.readOnly,
    })),
    restartPolicy: v.restartPolicy,
    restartMaxRetry: v.restartMaxRetry,
    publishAllPorts: v.publishAllPorts,
    network: v.network,
    ipv4Address: v.ipv4Address,
    ipv6Address: v.ipv6Address,
    commandMode: v.commandMode,
    commandText: v.commandText,
    commandArgs: v.commandArgs,
    entrypointMode: v.entrypointMode,
    entrypointText: v.entrypointText,
    entrypointArgs: v.entrypointArgs,
    autoRemove: v.autoRemove,
    privileged: v.privileged,
    tty: v.tty,
    openStdin: v.openStdin,
    cpuShares: v.cpuShares,
    cpuQuotaCores: v.cpuQuotaCores,
    memoryMb: v.memoryMb,
  }
}

const translate = i18n.t.bind(i18n) as (key: string, params?: Record<string, string>) => string

export const runContainerFormSchema = runContainerFormBaseSchema.superRefine((data, ctx) => {
  const params = buildRunParamsFromForm(runFormValuesToBuildArgs(data))
  for (const { messageKey, params: messageParams, path } of getRunContainerValidationIssues(params)) {
    ctx.addIssue({
      code: 'custom',
      message: translate(messageKey, messageParams),
      path: path.length ? path : [],
    })
  }
})

export const runContainerFormDefaultValues: RunContainerFormValues = {
  name: '',
  image: '',
  imageManualInput: false,
  forcePull: false,
  envEntries: [],
  labelEntries: [],
  ports: [],
  volumes: [],
  publishAllPorts: false,
  network: 'bridge',
  ipv4Address: '',
  ipv6Address: '',
  commandMode: 'raw',
  commandText: '',
  commandArgs: [],
  entrypointMode: 'raw',
  entrypointText: '',
  entrypointArgs: [],
  autoRemove: false,
  privileged: false,
  tty: false,
  openStdin: false,
  cpuShares: '',
  cpuQuotaCores: '',
  memoryMb: '',
  restartPolicy: 'unless-stopped',
  restartMaxRetry: '0',
}
