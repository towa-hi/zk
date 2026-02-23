import { buildPoseidon } from "circomlibjs";

export const WEIGHT_PROOF_VERSION = 2 as const;
export const LOADOUT_LEN = 10 as const;
export const DOMAIN_TAG = "stellexp_wt_v2__";

// Fixed category order:
// 0 fuel_tank
// 1 resist_heat
// 2 resist_cold
// 3 resist_bio
// 4 resist_rad
// 5 extract_heat
// 6 extract_cold
// 7 extract_bio
// 8 extract_rad
// 9 cargo_hold
export type LoadoutTiers10 = [
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

export interface WeightProofWitness {
  loadoutTiers: LoadoutTiers10;
  salt: Uint8Array; // 32 bytes
}

export interface WeightProofPublic {
  commitment: Uint8Array; // 32 bytes
  sessionId: number; // u32
  playerAddress: Uint8Array; // 32 bytes
  domainTag: Uint8Array; // 16 bytes
}

export interface WeightProofJournal {
  statementVersion: number; // u16
  allSlotsOccupied: boolean;
  commitment: Uint8Array; // 32 bytes
}

const RESISTANCE_INDICES = [1, 2, 3, 4] as const;
const NON_RESISTANCE_INDICES = [0, 5, 6, 7, 8, 9] as const;

function isIndexInSet(index: number, set: readonly number[]): boolean {
  for (const x of set) {
    if (x === index) return true;
  }
  return false;
}

export function validateLoadoutTiers(loadout: LoadoutTiers10): void {
  if (loadout.length !== LOADOUT_LEN) {
    throw new Error(`loadout length must be ${LOADOUT_LEN}`);
  }

  for (let i = 0; i < loadout.length; i++) {
    const tier = loadout[i];
    if (!Number.isInteger(tier) || tier < 0) {
      throw new Error(`tier at index ${i} must be a non-negative integer`);
    }

    if (isIndexInSet(i, RESISTANCE_INDICES)) {
      if (tier > 1) {
        throw new Error(`resistance tier at index ${i} must be in [0,1]`);
      }
    } else if (isIndexInSet(i, NON_RESISTANCE_INDICES)) {
      if (tier > 2) {
        throw new Error(`tier at index ${i} must be in [0,2]`);
      }
    } else {
      throw new Error(`unknown loadout index ${i}`);
    }
  }
}

export function weightForTier(tier: number): number {
  if (tier === 0) return 0;
  if (tier === 1) return 2;
  if (tier === 2) return 5;
  throw new Error(`invalid tier ${tier}`);
}

export function computeTotalWeight(loadout: LoadoutTiers10): number {
  validateLoadoutTiers(loadout);
  let sum = 0;
  for (const tier of loadout) {
    sum += weightForTier(tier);
  }
  return sum;
}

export function assertWeightBudget(loadout: LoadoutTiers10, budget = 20): number {
  const total = computeTotalWeight(loadout);
  if (total > budget) {
    throw new Error(`weight budget exceeded: ${total} > ${budget}`);
  }
  return total;
}

export function assertAllSlotsOccupied(loadout: LoadoutTiers10): void {
  validateLoadoutTiers(loadout);
  for (let i = 0; i < loadout.length; i++) {
    if (loadout[i] < 0) {
      throw new Error(`slot ${i} is not occupied`);
    }
  }
}

export function normalizeDomainTag(input?: Uint8Array): Uint8Array {
  if (!input) return new TextEncoder().encode(DOMAIN_TAG);
  if (input.length !== 16) throw new Error("domain tag must be 16 bytes");
  return input;
}

function toBigIntBE(bytes: Uint8Array): bigint {
  let acc = 0n;
  for (const b of bytes) {
    acc = (acc << 8n) | BigInt(b);
  }
  return acc;
}

function splitToBigInts(bytes: Uint8Array, chunkBytes: number): bigint[] {
  const out: bigint[] = [];
  for (let i = 0; i < bytes.length; i += chunkBytes) {
    out.push(toBigIntBE(bytes.slice(i, i + chunkBytes)));
  }
  return out;
}

export function buildCommitmentPreimage(
  witness: WeightProofWitness,
  sessionId: number,
  playerAddress: Uint8Array,
  domainTag?: Uint8Array
): Uint8Array {
  validateLoadoutTiers(witness.loadoutTiers);
  if (witness.salt.length !== 32) throw new Error("salt must be 32 bytes");
  if (!Number.isInteger(sessionId) || sessionId < 0 || sessionId > 0xffffffff) {
    throw new Error("sessionId must be u32");
  }
  if (playerAddress.length !== 32) throw new Error("playerAddress must be 32 bytes");

  const domain = normalizeDomainTag(domainTag);
  const preimage = new Uint8Array(10 + 1 + 32 + 16 + 4 + 32);
  let o = 0;

  for (const t of witness.loadoutTiers) preimage[o++] = t & 0xff;
  preimage[o++] = 0xff;
  preimage.set(witness.salt, o);
  o += 32;
  preimage.set(domain, o);
  o += 16;

  preimage[o++] = (sessionId >>> 24) & 0xff;
  preimage[o++] = (sessionId >>> 16) & 0xff;
  preimage[o++] = (sessionId >>> 8) & 0xff;
  preimage[o++] = sessionId & 0xff;

  preimage.set(playerAddress, o);
  return preimage;
}

export async function computeCommitmentPoseidon(
  witness: WeightProofWitness,
  sessionId: number,
  _playerAddress: Uint8Array,
  _domainTag?: Uint8Array
): Promise<Uint8Array> {
  const poseidon = await buildPoseidon();
  const fieldInputs: bigint[] = [
    BigInt(WEIGHT_PROOF_VERSION),
    BigInt(sessionId),
    ...witness.loadoutTiers.map((tier) => BigInt(tier)),
    ...splitToBigInts(witness.salt, 16),
  ];
  let state = 0n;
  for (let i = 0; i < fieldInputs.length; i += 15) {
    const chunk = fieldInputs.slice(i, i + 15);
    state = poseidon.F.toObject(poseidon([state, ...chunk])) as bigint;
  }
  const commitmentField = state;
  const hex = commitmentField.toString(16).padStart(64, "0").slice(-64);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createPublicInput(
  witness: WeightProofWitness,
  sessionId: number,
  playerAddress: Uint8Array,
  domainTag?: Uint8Array
): Promise<WeightProofPublic> {
  assertAllSlotsOccupied(witness.loadoutTiers);
  const commitment = await computeCommitmentPoseidon(witness, sessionId, playerAddress, domainTag);
  return {
    commitment,
    sessionId,
    playerAddress,
    domainTag: normalizeDomainTag(domainTag),
  };
}

export function createJournal(publicInput: WeightProofPublic): WeightProofJournal {
  return {
    statementVersion: WEIGHT_PROOF_VERSION,
    allSlotsOccupied: true,
    commitment: publicInput.commitment,
  };
}
