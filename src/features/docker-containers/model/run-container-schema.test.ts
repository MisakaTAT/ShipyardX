import { describe, expect, it } from 'vitest'
import {
  runContainerFormDefaultValues,
  runContainerFormSchema,
  runFormValuesToBuildArgs,
} from '@/features/docker-containers/model/run-container-schema'
import { buildRunParamsFromForm } from '@/features/docker-containers/lib/docker-run-cli'

describe('runContainerFormSchema', () => {
  it('accepts structured env, labels, command, and entrypoint values', () => {
    const result = runContainerFormSchema.safeParse({
      ...runContainerFormDefaultValues,
      image: 'nginx:latest',
      envEntries: [
        { key: 'TZ', value: 'Asia/Shanghai' },
        { key: 'DEBUG', value: '1' },
      ],
      labelEntries: [{ key: 'app', value: 'shipyardx' }],
      commandMode: 'args',
      commandArgs: [{ value: 'nginx' }, { value: '-g' }, { value: 'daemon off;' }],
      entrypointMode: 'raw',
      entrypointText: '/docker-entrypoint.sh nginx',
    })

    expect(result.success).toBe(true)
  })

  it('rejects duplicate host port mappings', () => {
    const result = runContainerFormSchema.safeParse({
      ...runContainerFormDefaultValues,
      image: 'nginx:latest',
      ports: [
        { containerPort: 80, hostPort: 8080, protocol: 'tcp' },
        { containerPort: 81, hostPort: 8080, protocol: 'tcp' },
      ],
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => issue.message.includes('8080'))).toBe(true)
  })
})

describe('runFormValuesToBuildArgs', () => {
  it('converts structured fields into docker run params', () => {
    const params = buildRunParamsFromForm(
      runFormValuesToBuildArgs({
        ...runContainerFormDefaultValues,
        image: 'nginx:latest',
        envEntries: [{ key: 'TZ', value: 'Asia/Shanghai' }],
        labelEntries: [{ key: 'app', value: 'shipyardx' }],
        commandMode: 'args',
        commandArgs: [{ value: 'nginx' }, { value: '-g' }, { value: 'daemon off;' }],
        entrypointMode: 'raw',
        entrypointText: '/docker-entrypoint.sh nginx',
      })
    )

    expect(params.env).toEqual(['TZ=Asia/Shanghai'])
    expect(params.labels).toEqual(['app=shipyardx'])
    expect(params.command).toEqual(['nginx', '-g', 'daemon off;'])
    expect(params.entrypoint).toEqual(['/docker-entrypoint.sh', 'nginx'])
  })
})
