import {
  siAlmalinux,
  siAlpinelinux,
  siArchlinux,
  siCentos,
  siDebian,
  siFedora,
  siLinuxmint,
  siOpensuse,
  siRedhat,
  siRockylinux,
  siUbuntu,
  type SimpleIcon,
} from 'simple-icons'

export interface DistroLogo {
  title: string
  hex: string
  path: string
}

const MATCHERS: Array<[RegExp, SimpleIcon]> = [
  [/alma/i, siAlmalinux],
  [/rocky/i, siRockylinux],
  [/alpine/i, siAlpinelinux],
  [/arch/i, siArchlinux],
  [/linux ?mint/i, siLinuxmint],
  [/ubuntu/i, siUbuntu],
  [/debian/i, siDebian],
  [/cent ?os/i, siCentos],
  [/fedora/i, siFedora],
  [/(open)? ?suse|sles/i, siOpensuse],
  [/red ?hat|rhel/i, siRedhat],
]

export function resolveDistroLogo(os: string | undefined): DistroLogo | null {
  if (!os) return null
  const found = MATCHERS.find(([pattern]) => pattern.test(os))
  if (!found) return null
  const icon = found[1]
  return { title: icon.title, hex: `#${icon.hex}`, path: icon.path }
}
