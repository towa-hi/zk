#![no_std]

use soroban_sdk::{Bytes, BytesN, Env, contract, contractimpl};

#[contract]
pub struct Risc0DevVerifierContract;

#[contractimpl]
impl Risc0DevVerifierContract {
    /// Dev-only verifier backend for router wiring.
    /// Accepts any seal/image/journal and returns success.
    pub fn verify(_env: Env, _seal: Bytes, _image_id: BytesN<32>, _journal: BytesN<32>) {}
}
