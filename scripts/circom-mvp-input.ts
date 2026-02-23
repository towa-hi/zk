#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPublicInput, toHex, type WeightProofWitness } from "./risc0-weight-proof-schema";

function fixedBytes(len: number, byte: number): Uint8Array {
  return new Uint8Array(len).fill(byte);
}

function toBigIntHexBE(bytes: Uint8Array): string {
  return `0x${toHex(bytes)}`;
}

function split16(bytes: Uint8Array): [string, string] {
  const hi = bytes.slice(0, 16);
  const lo = bytes.slice(16, 32);
  return [toBigIntHexBE(hi), toBigIntHexBE(lo)];
}

async function main() {
  const witness: WeightProofWitness = {
    loadoutTiers: [0, 1, 1, 0, 0, 2, 1, 0, 0, 1],
    salt: fixedBytes(32, 0x42),
  };
  const sessionId = 424242;
  const playerAddress = fixedBytes(32, 0x11);

  const publicInput = await createPublicInput(witness, sessionId, playerAddress);
  const [saltHi, saltLo] = split16(witness.salt);

  const input = {
    loadout: witness.loadoutTiers.map((v) => String(v)),
    salt_chunks: [saltHi, saltLo],
    session_id: String(sessionId),
    statement_version: "2",
    all_slots_occupied: "1",
    commitment: toBigIntHexBE(publicInput.commitment),
  };

  const outputDir = resolve(process.cwd(), "artifacts/circom-mvp");
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "input.json"), JSON.stringify(input, null, 2));

  console.log(`Wrote ${resolve(outputDir, "input.json")}`);
}

await main();
