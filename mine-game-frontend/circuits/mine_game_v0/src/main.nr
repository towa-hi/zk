// Minimal v0 mine-game circuit.
//
// Current scope:
// - Verify only commitment binding.
// - Do not validate moves/resources/outcome yet.
//
// Note: This uses a simple deterministic mixer (not the final production hash).
// We'll replace this with the canonical commitment hash once the pipeline is wired.

fn dev_commitment(loadout: [Field; 10], salt: Field) -> Field {
    let weights = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let mut acc = salt * 17;

    for i in 0..10 {
        acc = acc * 131 + (loadout[i] * weights[i]);
    }

    acc
}

fn main(
    loadout: [Field; 10],
    salt: Field,
    commitment: pub Field,
) {
    assert(commitment == dev_commitment(loadout, salt));
}

#[test]
fn accepts_matching_commitment() {
    let loadout = [0, 1, 2, 1, 0, 2, 1, 0, 2, 1];
    let salt = 42;
    let commitment = dev_commitment(loadout, salt);
    main(loadout, salt, commitment);
}

#[test(should_fail)]
fn rejects_wrong_commitment() {
    let loadout = [0, 1, 2, 1, 0, 2, 1, 0, 2, 1];
    let salt = 42;
    let bad_commitment = 999;
    main(loadout, salt, bad_commitment);
}
