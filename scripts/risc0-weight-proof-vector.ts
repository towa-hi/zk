#!/usr/bin/env bun

import {
  assertAllSlotsOccupied,
  buildCommitmentPreimage,
  createJournal,
  createPublicInput,
  toHex,
  type WeightProofWitness,
} from "./risc0-weight-proof-schema";

function fixedBytes(len: number, byte: number): Uint8Array {
  return new Uint8Array(len).fill(byte);
}

async function main() {
  const witness: WeightProofWitness = {
    // Temporary MVP statement: every slot has a valid selected tier.
    loadoutTiers: [0, 1, 1, 0, 0, 2, 1, 0, 0, 1],
    salt: fixedBytes(32, 0x42),
  };

  const sessionId = 424242;
  const playerAddress = fixedBytes(32, 0x11);

  assertAllSlotsOccupied(witness.loadoutTiers);
  const publicInput = await createPublicInput(witness, sessionId, playerAddress);
  const preimage = buildCommitmentPreimage(witness, sessionId, playerAddress);
  const journal = createJournal(publicInput);

  const vector = {
    schema: "weight-proof-v2",
    statement: "all_slots_occupied",
    witness: {
      loadoutTiers: witness.loadoutTiers,
      saltHex: toHex(witness.salt),
    },
    public: {
      sessionId: publicInput.sessionId,
      playerAddressHex: toHex(publicInput.playerAddress),
      domainTagUtf8: new TextDecoder().decode(publicInput.domainTag),
      commitmentHex: toHex(publicInput.commitment),
      commitmentTagged: `poseidon_${toHex(publicInput.commitment)}`,
      preimageHex: toHex(preimage),
    },
    journal: {
      statementVersion: journal.statementVersion,
      allSlotsOccupied: journal.allSlotsOccupied,
      commitmentHex: toHex(journal.commitment),
    },
    todo: "replace temporary all_slots_occupied constraint with sum(weights)<=20 while preserving payload schema",
  };

  console.log(JSON.stringify(vector, null, 2));
}

main();
