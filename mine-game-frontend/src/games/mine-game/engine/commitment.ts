import { keccak_256 } from '@noble/hashes/sha3.js';
import type { Loadout } from './domain';
import { encodeLoadout, TEXT_ENCODER, toHex } from './sharedEncoding';

export function computeCommitment(loadout: Loadout, salt: string): string {
  const encodedLoadout = new Uint8Array(encodeLoadout(loadout));
  const encodedSalt = TEXT_ENCODER.encode(salt);
  const payload = new Uint8Array(encodedLoadout.length + 1 + encodedSalt.length);
  payload.set(encodedLoadout, 0);
  payload[encodedLoadout.length] = 255;
  payload.set(encodedSalt, encodedLoadout.length + 1);

  return `keccak_${toHex(keccak_256(payload))}`;
}
