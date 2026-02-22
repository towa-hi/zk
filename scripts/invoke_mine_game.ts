#!/usr/bin/env bun

/**
 * CLI helper to invoke mine-game verifier for e2e testing.
 *
 * Usage:
 *   bun run scripts/invoke_mine_game.ts --proof-blob <hex> --vk <hex> --verifier-id <contract-id> [--source <secret>] [--network <net>] [--dry-run]
 *
 * Or with pre-built artifacts:
 *   bun run scripts/invoke_mine_game.ts --circuit-dir mine-game-frontend/circuits/mine_game_v0/target --verifier-id <contract-id> [--source <secret>]
 *
 * Environment variables:
 *   MINE_GAME_VERIFIER_CONTRACT_ID - default verifier contract ID
 *   ULTRAHONK_VERIFIER_CONTRACT_ID - default UltraHonk verifier contract ID (for the underlying verifier)
 */

import { $ } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { readEnvFile, getEnvValue } from './utils/env';

function usage() {
  console.log(`
Usage: bun run scripts/invoke_mine_game.ts [options]

Options:
  --verifier-id <id>     Mine-game-verifier contract ID (or set MINE_GAME_VERIFIER_CONTRACT_ID)
  --proof-blob <hex>     Proof blob as hex string
  --vk <hex>             Verification key as hex string
  --circuit-dir <path>   Path to compiled circuit target directory (alternative to --proof-blob/--vk)
  --source <secret>      Stellar secret key for signing
  --network <net>        Network (default: testnet)
  --dry-run              Simulate only, don't submit
  --help                 Show this help

Example (direct hex):
  bun run scripts/invoke_mine_game.ts --proof-blob abcdef... --vk 123456... --verifier-id CABC...

Example (from artifacts - verify VK only):
  bun run scripts/invoke_mine_game.ts --circuit-dir mine-game-frontend/circuits/mine_game_v0/target --verifier-id CABC...
`);
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const dryRun = args.includes("--dry-run");

const existingEnv = await readEnvFile('.env').catch(() => []);
const verifierId = getArg("--verifier-id")
  || process.env.MINE_GAME_VERIFIER_CONTRACT_ID
  || getEnvValue(existingEnv, "VITE_MINE_GAME_VERIFIER_CONTRACT_ID")
  || getEnvValue(existingEnv, "MINE_GAME_VERIFIER_CONTRACT_ID");

const network = getArg("--network") || "testnet";
const source = getArg("--source") || process.env.STELLAR_SECRET_KEY;

if (!verifierId) {
  console.error("❌ No verifier contract ID provided. Use --verifier-id or set MINE_GAME_VERIFIER_CONTRACT_ID");
  process.exit(1);
}

if (!source) {
  console.error("❌ No source secret key provided. Use --source or set STELLAR_SECRET_KEY");
  process.exit(1);
}

let proofBlobHex = getArg("--proof-blob");
let vkHex = getArg("--vk");

const circuitDir = getArg("--circuit-dir");
if (circuitDir) {
  const vkPath = `${circuitDir}/vk/vk`;
  if (existsSync(vkPath)) {
    const vkBuf = readFileSync(vkPath);
    vkHex = Buffer.from(vkBuf).toString("hex");
    console.log(`📄 Loaded VK from ${vkPath} (${vkBuf.length} bytes)`);
  } else {
    console.error(`❌ VK file not found at ${vkPath}`);
    process.exit(1);
  }

  if (!proofBlobHex) {
    console.log("ℹ️  No proof blob provided; will test with VK only (dry-run mode)");
  }
}

if (!vkHex) {
  console.error("❌ No VK provided. Use --vk <hex> or --circuit-dir <path>");
  process.exit(1);
}

console.log(`\n🔍 Invoke target: mine-game-verifier @ ${verifierId}`);
console.log(`   Network: ${network}`);
console.log(`   VK size: ${vkHex.length / 2} bytes`);
if (proofBlobHex) {
  console.log(`   Proof blob size: ${proofBlobHex.length / 2} bytes`);
}
console.log(`   Dry run: ${dryRun}\n`);

if (!proofBlobHex) {
  console.log("⏭️  Skipping invocation (no proof blob). Use this script with a proof blob to test e2e.");
  console.log("   Generate a proof blob from the browser or via the NoirService.");
  process.exit(0);
}

const sendFlag = dryRun ? "--send no" : "";

try {
  console.log("🚀 Invoking verify on mine-game-verifier...");
  const cmd = `stellar contract invoke --id ${verifierId} --source-account ${source} --network ${network} ${sendFlag} -- verify --session_id 1 --player ${source} --vk_json ${vkHex} --proof_blob ${proofBlobHex} --commitment 00 --outputs '{"move_sequence":[],"resources_per_node":[],"total_resources":0,"final_hull":0,"final_fuel":0,"outcome":0,"evac_intensity":0}'`;

  const result = await $`sh -c ${cmd}`.text();
  console.log(`✅ Result: ${result.trim()}`);
} catch (error) {
  console.error("❌ Invocation failed:", error);
  process.exit(1);
}
