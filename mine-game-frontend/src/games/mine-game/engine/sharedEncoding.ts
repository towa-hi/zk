import type { Loadout } from './domain';

export const TEXT_ENCODER = new TextEncoder();

export const LOADOUT_ORDER: (keyof Loadout)[] = [
  'fuel_tank',
  'thermal_shielding',
  'cryo_insulation',
  'bio_filter',
  'rad_hardening',
  'thermal_extractor',
  'cryo_extractor',
  'bio_extractor',
  'rad_extractor',
  'cargo_hold',
];

export function encodeTier(tier: string): number {
  if (tier === 'standard') return 0;
  if (tier === 'enhanced') return 1;
  return 2;
}

export function encodeLoadout(loadout: Loadout): [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
] {
  return LOADOUT_ORDER.map((key) => encodeTier(loadout[key])) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
