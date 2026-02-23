fn main(ok: pub u8) {
    // Single public input smoke-test circuit.
    assert(ok == 1);
}

#[test]
fn test_smoke_constraints() {
    main(1);
}
