#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as snarkjs from "snarkjs";

type JsonObject = Record<string, unknown>;

function flattenGroth16ProofForOnChain(proof: any): string[] {
  return [
    proof.pi_a[0],
    proof.pi_a[1],
    proof.pi_b[0][1],
    proof.pi_b[0][0],
    proof.pi_b[1][1],
    proof.pi_b[1][0],
    proof.pi_c[0],
    proof.pi_c[1],
  ].map((x) => String(x));
}

async function main() {
  const root = process.cwd();
  const artifactsDir = resolve(root, "artifacts/circom-mvp");
  const inputPath = resolve(artifactsDir, "input.json");
  const wasmPath = resolve(root, "mine-game-frontend/public/circuits/mine_game_v2.wasm");
  const zkeyPath = resolve(root, "mine-game-frontend/public/circuits/mine_game_v2_final.zkey");
  const vkeyPath = resolve(root, "mine-game-frontend/public/circuits/mine_game_v2_vkey.json");

  const input = JSON.parse(await readFile(inputPath, "utf8")) as JsonObject;

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  const vkey = JSON.parse(await readFile(vkeyPath, "utf8")) as JsonObject;
  const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);

  if (!verified) {
    throw new Error("Local Groth16 verify failed");
  }

  const onChainPayload = {
    proof: flattenGroth16ProofForOnChain(proof),
    publicSignals: publicSignals.map((v: unknown) => String(v)),
  };

  await writeFile(resolve(artifactsDir, "proof.json"), JSON.stringify(proof, null, 2));
  await writeFile(resolve(artifactsDir, "public.json"), JSON.stringify(publicSignals, null, 2));
  await writeFile(resolve(artifactsDir, "onchain-payload.json"), JSON.stringify(onChainPayload, null, 2));

  console.log("Groth16 prove+verify succeeded.");
  console.log(`Wrote ${resolve(artifactsDir, "proof.json")}`);
  console.log(`Wrote ${resolve(artifactsDir, "public.json")}`);
  console.log(`Wrote ${resolve(artifactsDir, "onchain-payload.json")}`);
}

await main();
