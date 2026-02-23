#!/usr/bin/env bun

import { Buffer } from "buffer";
import { createHash } from "node:crypto";
import { Keypair, TransactionBuilder, hash } from "@stellar/stellar-sdk";
import { Client as MineGameClient, type ProofOutputs } from "../bindings/mine_game/src/index";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

const MINE_GAME_ID =
  process.env.MINE_GAME_CONTRACT_ID ||
  process.env.VITE_MINE_GAME_CONTRACT_ID ||
  "CA7KWUPPM4CXPHMKUNRNCWLP2ZPLXL75NT6RNTZTYXEZHXTG7GZKZ37M";

const PLAYER_SECRET =
  process.env.PLAYER_SECRET ||
  process.env.VITE_DEV_PLAYER1_SECRET ||
  "";

if (!PLAYER_SECRET) {
  console.error("Missing PLAYER_SECRET (or VITE_DEV_PLAYER1_SECRET)");
  process.exit(1);
}

const keypair = Keypair.fromSecret(PLAYER_SECRET);
const playerAddress = keypair.publicKey();

const signTransaction = async (txXdr: string, opts?: { networkPassphrase?: string }) => {
  if (!opts?.networkPassphrase) throw new Error("Missing networkPassphrase");
  const tx = TransactionBuilder.fromXDR(txXdr, opts.networkPassphrase);
  tx.sign(keypair);
  return { signedTxXdr: tx.toXDR(), signerAddress: playerAddress };
};

const signAuthEntry = async (preimageXdr: string) => {
  const payload = hash(Buffer.from(preimageXdr, "base64"));
  const signatureBytes = keypair.sign(payload);
  return {
    signedAuthEntry: Buffer.from(signatureBytes).toString("base64"),
    signerAddress: playerAddress,
  };
};

const client = new MineGameClient({
  contractId: MINE_GAME_ID,
  rpcUrl: RPC_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
  publicKey: playerAddress,
  signTransaction,
  signAuthEntry,
});

async function send(txPromise: Promise<any>) {
  const tx = await txPromise;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await tx.signAndSend({ force: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = msg.includes("TRY_AGAIN_LATER") || msg.includes("timeout");
      if (!retryable || attempt === 5) {
        try {
          const simulated = await tx.simulate();
          return await simulated.signAndSend({ force: true });
        } catch {
          throw err;
        }
      }
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
  throw new Error("Unexpected send failure");
}

function buildOutputs(outcome: 0 | 1): ProofOutputs {
  return {
    move_sequence: [1, 2, 3],
    resources_per_node: [10, 20, 30],
    total_resources: 60,
    final_hull: 5,
    final_fuel: 2,
    outcome,
    evac_intensity: outcome === 0 ? 2 : 0,
  };
}

function hex32(byte: number): Buffer {
  return Buffer.from(new Uint8Array(32).fill(byte));
}

function parseByteList(raw: string): number[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .map((x) => Number.parseInt(x, 0))
    .filter((x) => Number.isFinite(x) && x >= 0 && x <= 255);
}

async function loadNethermindFixture(): Promise<{
  seal: Buffer;
  imageId: Buffer;
  journalDigest: Buffer;
}> {
  const url =
    "https://raw.githubusercontent.com/NethermindEth/stellar-risc0-verifier/main/contracts/groth16-verifier/src/test.rs";
  const source = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch fixture (${r.status})`);
    return r.text();
  });

  const sealMatch = source.match(/const TEST_SEAL: \[u8; \d+\] = \[([\s\S]*?)\];/);
  const imageMatch = source.match(/const TEST_IMAGE_ID: \[u8; 32\] = \[([\s\S]*?)\];/);
  const journalMatch = source.match(/const TEST_JOURNAL: \[u8; \d+\] = \[([\s\S]*?)\];/);

  if (!sealMatch || !imageMatch || !journalMatch) {
    throw new Error("Could not parse Nethermind fixture constants");
  }

  const sealBytes = parseByteList(sealMatch[1]);
  const imageBytes = parseByteList(imageMatch[1]);
  const journalBytes = parseByteList(journalMatch[1]);

  if (imageBytes.length !== 32) {
    throw new Error(`Fixture image id length mismatch: ${imageBytes.length}`);
  }

  const journalDigest = createHash("sha256").update(Buffer.from(journalBytes)).digest();

  return {
    seal: Buffer.from(sealBytes),
    imageId: Buffer.from(imageBytes),
    journalDigest,
  };
}

function summarizeResult(label: string, sent: any) {
  const result = sent?.result;
  const isErr = result?.isErr?.() === true;
  if (isErr) {
    let errValue = "unknown";
    try {
      errValue = String(result.unwrapErr?.());
    } catch {
      // ignore
    }
    console.log(`${label}: FAILED (${errValue})`);
    return false;
  }
  console.log(`${label}: OK`);
  return true;
}

async function run() {
  const base = Math.floor(Date.now() % 1_000_000_000);
  const sessionValid = base;
  const sessionTampered = base + 1;
  const points = 100_0000000n;

  console.log(`Using mine-game contract: ${MINE_GAME_ID}`);
  console.log(`Using player: ${playerAddress}`);

  const commitmentValid = hex32(0x01);
  const useFixture = (process.env.USE_NETHERMIND_FIXTURE || "true").toLowerCase() !== "false";
  const fixture = useFixture ? await loadNethermindFixture() : null;
  const sealValid = fixture?.seal ?? Buffer.from(new Uint8Array(96).fill(0xee));
  const imageValid = fixture?.imageId ?? hex32(0x11);
  const journalValid = fixture?.journalDigest ?? hex32(0x22);

  if (fixture) {
    console.log(`Loaded Nethermind fixture: seal=${sealValid.length} bytes`);
  }

  const startValid = await send(
    client.start_game({
      session_id: sessionValid,
      player1: playerAddress,
      player2: playerAddress,
      player1_points: points,
      player2_points: 0n,
    })
  );
  summarizeResult("start_game(valid)", startValid);

  const commitValid = await send(
    client.commit_loadout({
      session_id: sessionValid,
      player: playerAddress,
      commitment: commitmentValid,
    })
  );
  summarizeResult("commit_loadout(valid)", commitValid);

  const submitValid = await send(
    client.submit_proof({
      session_id: sessionValid,
      player: playerAddress,
      seal: sealValid,
      image_id: imageValid,
      journal_digest: journalValid,
      dev_mode: false,
      submitted_commitment: commitmentValid,
      public_outputs: buildOutputs(0),
    })
  );
  const validOk = summarizeResult("submit_proof(valid)", submitValid);

  const commitmentTampered = hex32(0x02);
  const startTampered = await send(
    client.start_game({
      session_id: sessionTampered,
      player1: playerAddress,
      player2: playerAddress,
      player1_points: points,
      player2_points: 0n,
    })
  );
  summarizeResult("start_game(tampered)", startTampered);

  const commitTampered = await send(
    client.commit_loadout({
      session_id: sessionTampered,
      player: playerAddress,
      commitment: commitmentTampered,
    })
  );
  summarizeResult("commit_loadout(tampered)", commitTampered);

  let tamperedOk = false;
  try {
    const submitTampered = await send(
      client.submit_proof({
        session_id: sessionTampered,
        player: playerAddress,
        seal: sealValid,
        image_id: hex32(0x99),
        journal_digest: journalValid,
        dev_mode: false,
        submitted_commitment: commitmentTampered,
        public_outputs: buildOutputs(0),
      })
    );
    tamperedOk = summarizeResult("submit_proof(tampered)", submitTampered);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`submit_proof(tampered): FAILED (${msg})`);
    tamperedOk = false;
  }

  console.log("\n=== SUMMARY ===");
  console.log(`valid submission accepted: ${validOk ? "YES" : "NO"}`);
  console.log(`tampered submission accepted: ${tamperedOk ? "YES" : "NO"}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
