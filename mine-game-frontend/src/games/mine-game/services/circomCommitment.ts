import { buildPoseidon } from "circomlibjs";

const textEncoder = new TextEncoder();
const STATEMENT_VERSION = 2n;

function toBigIntBE(bytes: Uint8Array): bigint {
  let acc = 0n;
  for (const b of bytes) {
    acc = (acc << 8n) | BigInt(b);
  }
  return acc;
}

function hex32(value: bigint): string {
  return value.toString(16).padStart(64, "0").slice(-64);
}

function saltToBytes32(salt: string): Uint8Array {
  const encoded = textEncoder.encode(salt);
  const bytes = new Uint8Array(32);
  bytes.set(encoded.slice(0, 32));
  return bytes;
}

function saltChunksHex(salt: string): [string, string] {
  const bytes = saltToBytes32(salt);
  const hi = toBigIntBE(bytes.slice(0, 16));
  const lo = toBigIntBE(bytes.slice(16, 32));
  return [hi.toString(), lo.toString()];
}

export interface CircomCommitmentResult {
  commitmentTagged: string;
  circuitSaltChunks: [string, string];
}

export async function computePoseidonCommitment(args: {
  statementVersion?: number;
  sessionId: number;
  loadout: number[];
  salt: string;
}): Promise<CircomCommitmentResult> {
  const poseidon = await buildPoseidon();
  const version = BigInt(args.statementVersion ?? Number(STATEMENT_VERSION));
  const [saltHi, saltLo] = saltChunksHex(args.salt);
  const inputs = [
    0n,
    version,
    BigInt(args.sessionId),
    ...args.loadout.map((v) => BigInt(v)),
    BigInt(saltHi),
    BigInt(saltLo),
  ];
  const commitment = poseidon.F.toObject(poseidon(inputs)) as bigint;
  return {
    commitmentTagged: `poseidon_${hex32(commitment)}`,
    circuitSaltChunks: [saltHi, saltLo],
  };
}
