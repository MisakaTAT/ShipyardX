import { describe, expect, it } from 'vitest'

import {
  isValidVersion,
  updateCargoTomlVersion,
  updatePackageJsonVersion,
  updateTauriConfigVersion,
} from './release-version.mjs'

describe('release-version', () => {
  it('accepts stable and prerelease semver strings', () => {
    expect(isValidVersion('0.1.0')).toBe(true)
    expect(isValidVersion('0.1.0-rc.1')).toBe(true)
    expect(isValidVersion('1.2.3-beta.4')).toBe(true)
  })

  it('rejects invalid version strings', () => {
    expect(isValidVersion('v0.1.0')).toBe(false)
    expect(isValidVersion('0.1')).toBe(false)
    expect(isValidVersion('latest')).toBe(false)
  })

  it('updates package.json version', () => {
    const input = JSON.stringify({ name: 'shipyardx', version: '0.1.0' }, null, 2)

    const output = updatePackageJsonVersion(input, '0.1.0-rc.1')

    expect(JSON.parse(output).version).toBe('0.1.0-rc.1')
  })

  it('updates tauri.conf.json version', () => {
    const input = JSON.stringify({ productName: 'ShipyardX', version: '0.1.0' }, null, 2)

    const output = updateTauriConfigVersion(input, '0.1.0-rc.1')

    expect(JSON.parse(output).version).toBe('0.1.0-rc.1')
  })

  it('updates Cargo.toml version', () => {
    const input = [
      '[package]',
      'name = "shipyardx"',
      'version = "0.1.0"',
      'edition = "2024"',
      '',
      '[dependencies]',
      'tauri = { version = "2" }',
    ].join('\n')

    const output = updateCargoTomlVersion(input, '0.1.0-rc.1')

    expect(output).toContain('version = "0.1.0-rc.1"')
    expect(output).not.toContain('version = "0.1.0"\nedition')
  })
})
