import type { ProofPayload } from "../engine/domain";
import { computePoseidonCommitment } from "./circomCommitment";
import * as snarkjs from "snarkjs";

export interface CircomProofResult {
  proof: string[];
  publicSignals: string[];
  commitment: string;
}

function flattenGroth16ProofForOnChain(proof: any): string[] {
  return [
    proof.pi_a[0],
    proof.pi_a[1],
    // Soroban BN254 follows Ethereum precompile ordering for G2 limbs: x1, x0, y1, y0.
    proof.pi_b[0][1],
    proof.pi_b[0][0],
    proof.pi_b[1][1],
    proof.pi_b[1][0],
    proof.pi_c[0],
    proof.pi_c[1],
  ].map((x) => String(x));
}

function parseDecimalOrHex(value: string): bigint {
  if (value.startsWith("0x")) return BigInt(value);
  return BigInt(value);
}

function taggedHexFromField(value: string): string {
  const hex = parseDecimalOrHex(value).toString(16).padStart(64, "0").slice(-64);
  return `poseidon_${hex}`;
}

function circuitsPath(file: string): string {
  const base = import.meta.env.VITE_CIRCOM_ASSET_BASE || "/circuits";
  return `${String(base).replace(/\/$/, "")}/${file}`;
}

export async function generateProof(payload: ProofPayload): Promise<CircomProofResult> {
  const commitmentResult = await computePoseidonCommitment({
    statementVersion: payload.publicInputs.statementVersion,
    sessionId: payload.publicInputs.sessionId,
    loadout: [...payload.privateInputs.loadout],
    salt: payload.privateInputs.salt,
  });

  const input = {
    loadout: payload.privateInputs.loadout.map((v) => String(v)),
    salt_chunks: commitmentResult.circuitSaltChunks,
    session_id: String(payload.publicInputs.sessionId),
    statement_version: String(payload.publicInputs.statementVersion),
    all_slots_occupied: "1",
    commitment: `0x${commitmentResult.commitmentTagged.slice("poseidon_".length)}`,
  };

  const wasmPath = circuitsPath("mine_game_v2.wasm");
  const zkeyPath = circuitsPath("mine_game_v2_final.zkey");
  const vkeyPath = circuitsPath("mine_game_v2_vkey.json");

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  const response = await fetch(vkeyPath);
  if (!response.ok) {
    throw new Error(`Failed to load verification key: ${response.status}`);
  }
  const vkey = await response.json();
  const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!verified) {
    throw new Error("Local Groth16 verification failed");
  }

  return {
    proof: flattenGroth16ProofForOnChain(proof),
    publicSignals: publicSignals.map((s: string) => String(s)),
    commitment: taggedHexFromField(publicSignals[3]),
  };
}
