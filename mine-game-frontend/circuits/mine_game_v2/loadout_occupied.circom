pragma circom 2.1.9;

include "../../../node_modules/circomlib/circuits/poseidon.circom";

template AssertTier012() {
    signal input in;
    signal d0;
    signal d1;
    signal d2;
    signal q;

    d0 <== in;
    d1 <== in - 1;
    d2 <== in - 2;
    q <== d0 * d1;
    q * d2 === 0;
}

template MineGameLoadoutOccupiedV2() {
    signal input loadout[10];
    signal input salt_chunks[2];

    signal input session_id;
    signal input statement_version;
    signal input all_slots_occupied;
    signal input commitment;

    component tier_check[10];
    for (var i = 0; i < 10; i++) {
        tier_check[i] = AssertTier012();
        tier_check[i].in <== loadout[i];
    }

    // Temporary MVP statement:
    // all slots are occupied (represented as valid tier selections).
    all_slots_occupied === 1;
    statement_version === 2;

    // TODO: Replace with sum(weights) <= 20 while preserving public I/O schema.
    component commit_hash = Poseidon(15);
    commit_hash.inputs[0] <== 0;
    commit_hash.inputs[1] <== statement_version;
    commit_hash.inputs[2] <== session_id;
    commit_hash.inputs[3] <== loadout[0];
    commit_hash.inputs[4] <== loadout[1];
    commit_hash.inputs[5] <== loadout[2];
    commit_hash.inputs[6] <== loadout[3];
    commit_hash.inputs[7] <== loadout[4];
    commit_hash.inputs[8] <== loadout[5];
    commit_hash.inputs[9] <== loadout[6];
    commit_hash.inputs[10] <== loadout[7];
    commit_hash.inputs[11] <== loadout[8];
    commit_hash.inputs[12] <== loadout[9];
    commit_hash.inputs[13] <== salt_chunks[0];
    commit_hash.inputs[14] <== salt_chunks[1];
    commitment === commit_hash.out;
}

component main { public [session_id, statement_version, all_slots_occupied, commitment] } = MineGameLoadoutOccupiedV2();
