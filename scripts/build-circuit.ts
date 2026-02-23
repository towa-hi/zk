#!/usr/bin/env bun

/**
 * Circom MVP circuit helper.
 *
 * This script prepares deterministic input artifacts and performs local prove+verify
 * when the compiled circuit artifacts are present.
 */

import { $ } from "bun";
import { existsSync } from "node:fs";

console.log("🧪 Running Poseidon v2 vector smoke check...");
await $`bun run scripts/circom-weight-proof-vector.ts`;
console.log("🧾 Writing Circom MVP input.json...");
await $`bun run scripts/circom-mvp-input.ts`;

console.log("🔍 Checking for compiled Circom artifacts...");
const wasmPath = "mine-game-frontend/public/circuits/mine_game_v2.wasm";
const zkeyPath = "mine-game-frontend/public/circuits/mine_game_v2_final.zkey";
const vkeyPath = "mine-game-frontend/public/circuits/mine_game_v2_vkey.json";
const exists = existsSync(wasmPath) && existsSync(zkeyPath) && existsSync(vkeyPath);

if (exists) {
  console.log("✅ Found compiled artifacts, running Groth16 prove+verify...");
  await $`node scripts/circom-mvp-prove.mjs`;
} else {
  console.log("⚠️  Compiled artifacts not found. Provide:");
  console.log(`   - ${wasmPath}`);
  console.log(`   - ${zkeyPath}`);
  console.log(`   - ${vkeyPath}`);
  console.log("Then rerun: bun run circuit");
}
