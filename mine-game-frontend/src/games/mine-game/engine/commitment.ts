import { keccak_256 } from '@noble/hashes/sha3.js';
import type { Loadout } from './domain';

const TEXT_ENCODER = new TextEncoder();

const LOADOUT_ORDER: (keyof Loadout)[] = [
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

function encodeTier(tier: string): number {
  if (tier === 'standard') return 0;
  if (tier === 'enhanced') return 1;
  return 2;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function computeCommitment(loadout: Loadout, salt: string): string {
  const encodedLoadout = new Uint8Array(LOADOUT_ORDER.map((key) => encodeTier(loadout[key])));
  const encodedSalt = TEXT_ENCODER.encode(salt);
  const payload = new Uint8Array(encodedLoadout.length + 1 + encodedSalt.length);
  payload.set(encodedLoadout, 0);
  payload[encodedLoadout.length] = 255;
  payload.set(encodedSalt, encodedLoadout.length + 1);

  return `keccak_${toHex(keccak_256(payload))}`;
}
