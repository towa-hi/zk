#![no_std]

use soroban_sdk::{Address, Bytes, BytesN, Env, Vec, contract, contractclient, contractimpl, contracttype};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProofOutputs {
    pub move_sequence: Vec<u32>,
    pub resources_per_node: Vec<u32>,
    pub total_resources: u32,
    pub final_hull: u32,
    pub final_fuel: u32,
    pub outcome: u32,
    pub evac_intensity: u32,
}

#[contract]
pub struct MineGameVerifierContract;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    UltraHonkAddress,
}

#[contractclient(name = "UltraHonkVerifierClient")]
pub trait UltraHonkVerifier {
    fn verify_proof(env: Env, vk_json: Bytes, proof_blob: Bytes) -> BytesN<32>;
}

const FIELD_SIZE: u32 = 32;
const HEADER_SIZE: u32 = 4;
const V0_COMMITMENT_FIELDS: u32 = 32;

// Public input layout after commitment (32 fields):
// [32] pub_outcome: u32
// [33] pub_total_resources: u32
// [34] pub_final_hull: u32
// [35] pub_final_fuel: u32
// [36] pub_evac_intensity: u32
// [37..46] pub_move_sequence: [u32; 10]
// [47..56] pub_resources_per_node: [u32; 10]
const IDX_OUTCOME: u32 = 32;
const IDX_TOTAL_RESOURCES: u32 = 33;
const IDX_FINAL_HULL: u32 = 34;
const IDX_FINAL_FUEL: u32 = 35;
const IDX_EVAC_INTENSITY: u32 = 36;
const IDX_MOVE_SEQUENCE_START: u32 = 37;
const IDX_RESOURCES_START: u32 = 47;
const TOTAL_PUBLIC_FIELDS: u32 = 57;

#[contractimpl]
impl MineGameVerifierContract {
    pub fn __constructor(env: Env, admin: Address, _game_hub: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("admin not set")
    }

    pub fn set_admin(env: Env, admin: Address) {
        require_admin(&env);
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn set_ultrahonk_address(env: Env, address: Address) {
        require_admin(&env);
        env.storage()
            .instance()
            .set(&DataKey::UltraHonkAddress, &address);
    }

    pub fn get_ultrahonk_address(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::UltraHonkAddress)
    }

    /// Verify a proof using the UltraHonk verifier contract,
    /// then check that the public inputs embedded in the proof blob
    /// match the claimed commitment and outputs.
    pub fn verify(
        env: Env,
        _session_id: u32,
        _player: Address,
        vk_json: Bytes,
        proof_blob: Bytes,
        commitment: Bytes,
        outputs: ProofOutputs,
    ) -> bool {
        let ultrahonk_addr: Option<Address> =
            env.storage().instance().get(&DataKey::UltraHonkAddress);

        let ultrahonk_addr = match ultrahonk_addr {
            Some(addr) => addr,
            None => return false,
        };

        let client = UltraHonkVerifierClient::new(&env, &ultrahonk_addr);
        if client.try_verify_proof(&vk_json, &proof_blob).is_err() {
            return false;
        }

        let extracted_commitment = match extract_commitment_from_blob(&proof_blob) {
            Some(c) => c,
            None => return false,
        };
        if extracted_commitment != commitment {
            return false;
        }

        validate_outputs_binding(&proof_blob, &outputs)
    }
}

/// Extract the 32-byte keccak commitment from the proof blob's public inputs.
///
/// Proof blob format: u32_be(total_fields) || public_input_fields || proof_fields
/// Each field element is 32 bytes big-endian. For v0, there are 32 public input
/// fields representing the commitment bytes (one byte per field, stored in the
/// least significant byte of each 32-byte field).
fn extract_commitment_from_blob(proof_blob: &Bytes) -> Option<Bytes> {
    let min_size = HEADER_SIZE + V0_COMMITMENT_FIELDS * FIELD_SIZE;
    if proof_blob.len() < min_size {
        return None;
    }

    let env = proof_blob.env();
    let mut commitment_bytes = Bytes::new(env);

    for i in 0..V0_COMMITMENT_FIELDS {
        let field_start = HEADER_SIZE + i * FIELD_SIZE;
        let byte_value = proof_blob.get(field_start + FIELD_SIZE - 1)?;
        commitment_bytes.push_back(byte_value);
    }

    Some(commitment_bytes)
}

/// Extract a u32 value from a field element at the given public input index.
/// Each field is 32 bytes big-endian; the u32 value is in the last 4 bytes.
fn extract_u32_field(proof_blob: &Bytes, field_index: u32) -> Option<u32> {
    let offset = HEADER_SIZE + field_index * FIELD_SIZE;
    if proof_blob.len() < offset + FIELD_SIZE {
        return None;
    }
    let b0 = proof_blob.get(offset + FIELD_SIZE - 4)?;
    let b1 = proof_blob.get(offset + FIELD_SIZE - 3)?;
    let b2 = proof_blob.get(offset + FIELD_SIZE - 2)?;
    let b3 = proof_blob.get(offset + FIELD_SIZE - 1)?;
    Some(((b0 as u32) << 24) | ((b1 as u32) << 16) | ((b2 as u32) << 8) | (b3 as u32))
}

/// Validate that the ProofOutputs match the public inputs in the proof blob.
fn validate_outputs_binding(proof_blob: &Bytes, outputs: &ProofOutputs) -> bool {
    let min_size = HEADER_SIZE + TOTAL_PUBLIC_FIELDS * FIELD_SIZE;
    if proof_blob.len() < min_size {
        return false;
    }

    let outcome = match extract_u32_field(proof_blob, IDX_OUTCOME) {
        Some(v) => v,
        None => return false,
    };
    if outcome != outputs.outcome {
        return false;
    }

    let total_resources = match extract_u32_field(proof_blob, IDX_TOTAL_RESOURCES) {
        Some(v) => v,
        None => return false,
    };
    if total_resources != outputs.total_resources {
        return false;
    }

    let final_hull = match extract_u32_field(proof_blob, IDX_FINAL_HULL) {
        Some(v) => v,
        None => return false,
    };
    if final_hull != outputs.final_hull {
        return false;
    }

    let final_fuel = match extract_u32_field(proof_blob, IDX_FINAL_FUEL) {
        Some(v) => v,
        None => return false,
    };
    if final_fuel != outputs.final_fuel {
        return false;
    }

    let evac_intensity = match extract_u32_field(proof_blob, IDX_EVAC_INTENSITY) {
        Some(v) => v,
        None => return false,
    };
    if evac_intensity != outputs.evac_intensity {
        return false;
    }

    for i in 0..outputs.move_sequence.len() {
        let seq_val = match extract_u32_field(proof_blob, IDX_MOVE_SEQUENCE_START + i) {
            Some(v) => v,
            None => return false,
        };
        if seq_val != outputs.move_sequence.get(i).unwrap_or(0) {
            return false;
        }
    }

    for i in 0..outputs.resources_per_node.len() {
        let res_val = match extract_u32_field(proof_blob, IDX_RESOURCES_START + i) {
            Some(v) => v,
            None => return false,
        };
        if res_val != outputs.resources_per_node.get(i).unwrap_or(0) {
            return false;
        }
    }

    true
}

fn require_admin(env: &Env) {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("admin not set");
    admin.require_auth();
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{contract, contractimpl, vec};

    #[contract]
    struct MockUltraHonkVerifier;

    #[contractimpl]
    impl MockUltraHonkVerifier {
        pub fn verify_proof(_env: Env, _vk_json: Bytes, _proof_blob: Bytes) -> BytesN<32> {
            BytesN::from_array(&_env, &[0xab; 32])
        }
    }

    #[contract]
    struct FailingUltraHonkVerifier;

    #[contractimpl]
    impl FailingUltraHonkVerifier {
        pub fn verify_proof(_env: Env, _vk_json: Bytes, _proof_blob: Bytes) -> BytesN<32> {
            panic!("verification failed")
        }
    }

    fn push_u32_field(blob: &mut Bytes, value: u32) {
        for _ in 0..(FIELD_SIZE - 4) {
            blob.push_back(0);
        }
        for b in value.to_be_bytes() {
            blob.push_back(b);
        }
    }

    fn build_proof_blob_with_outputs(
        env: &Env,
        commitment: &[u8; 32],
        outputs: &ProofOutputs,
    ) -> Bytes {
        let num_proof_fields: u32 = 4;
        let total_fields: u32 = TOTAL_PUBLIC_FIELDS + num_proof_fields;

        let mut blob = Bytes::new(env);
        for b in total_fields.to_be_bytes() {
            blob.push_back(b);
        }

        // 32 commitment bytes as fields
        for &byte_val in commitment.iter() {
            for _ in 0..(FIELD_SIZE - 1) {
                blob.push_back(0);
            }
            blob.push_back(byte_val);
        }

        // Game output fields
        push_u32_field(&mut blob, outputs.outcome);
        push_u32_field(&mut blob, outputs.total_resources);
        push_u32_field(&mut blob, outputs.final_hull);
        push_u32_field(&mut blob, outputs.final_fuel);
        push_u32_field(&mut blob, outputs.evac_intensity);

        // Move sequence (10 fields)
        for i in 0..10u32 {
            let val = if i < outputs.move_sequence.len() {
                outputs.move_sequence.get(i).unwrap_or(0)
            } else {
                0
            };
            push_u32_field(&mut blob, val);
        }

        // Resources per node (10 fields)
        for i in 0..10u32 {
            let val = if i < outputs.resources_per_node.len() {
                outputs.resources_per_node.get(i).unwrap_or(0)
            } else {
                0
            };
            push_u32_field(&mut blob, val);
        }

        // Proof padding
        for _ in 0..(num_proof_fields * FIELD_SIZE) {
            blob.push_back(0xee);
        }

        blob
    }

    #[test]
    fn verify_returns_false_when_not_configured() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let game_hub = Address::generate(&env);
        let contract_id = env.register(MineGameVerifierContract, (&admin, &game_hub));
        let client = MineGameVerifierContractClient::new(&env, &contract_id);

        let player = Address::generate(&env);
        let outputs = ProofOutputs {
            move_sequence: Vec::new(&env),
            resources_per_node: Vec::new(&env),
            total_resources: 0,
            final_hull: 0,
            final_fuel: 0,
            outcome: 0,
            evac_intensity: 0,
        };

        let ok = client.verify(
            &1u32,
            &player,
            &Bytes::from_array(&env, &[1, 2, 3]),
            &Bytes::from_array(&env, &[4, 5, 6]),
            &Bytes::from_array(&env, &[7, 8, 9]),
            &outputs,
        );
        assert!(!ok);
    }

    fn sample_outputs(env: &Env) -> ProofOutputs {
        ProofOutputs {
            move_sequence: vec![env, 2, 4],
            resources_per_node: vec![env, 40, 20],
            total_resources: 60,
            final_hull: 8,
            final_fuel: 3,
            outcome: 0,
            evac_intensity: 1,
        }
    }

    #[test]
    fn verify_accepts_matching_commitment_and_outputs() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let game_hub = Address::generate(&env);
        let contract_id = env.register(MineGameVerifierContract, (&admin, &game_hub));
        let client = MineGameVerifierContractClient::new(&env, &contract_id);

        let ultrahonk_addr = env.register(MockUltraHonkVerifier, ());
        client.set_ultrahonk_address(&ultrahonk_addr);

        let commitment_arr: [u8; 32] = [
            0xaa, 0xbb, 0xcc, 0xdd, 0x01, 0x02, 0x03, 0x04,
            0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
            0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14,
            0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c,
        ];
        let outputs = sample_outputs(&env);
        let proof_blob = build_proof_blob_with_outputs(&env, &commitment_arr, &outputs);
        let commitment = Bytes::from_array(&env, &commitment_arr);

        let player = Address::generate(&env);

        let ok = client.verify(
            &1u32,
            &player,
            &Bytes::from_array(&env, &[1]),
            &proof_blob,
            &commitment,
            &outputs,
        );
        assert!(ok);
    }

    #[test]
    fn verify_rejects_mismatched_commitment() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let game_hub = Address::generate(&env);
        let contract_id = env.register(MineGameVerifierContract, (&admin, &game_hub));
        let client = MineGameVerifierContractClient::new(&env, &contract_id);

        let ultrahonk_addr = env.register(MockUltraHonkVerifier, ());
        client.set_ultrahonk_address(&ultrahonk_addr);

        let proof_commitment: [u8; 32] = [0xaa; 32];
        let outputs = sample_outputs(&env);
        let proof_blob = build_proof_blob_with_outputs(&env, &proof_commitment, &outputs);
        let claimed_commitment = Bytes::from_array(&env, &[0xbb; 32]);

        let player = Address::generate(&env);

        let ok = client.verify(
            &1u32,
            &player,
            &Bytes::from_array(&env, &[1]),
            &proof_blob,
            &claimed_commitment,
            &outputs,
        );
        assert!(!ok);
    }

    #[test]
    fn verify_rejects_mismatched_outputs() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let game_hub = Address::generate(&env);
        let contract_id = env.register(MineGameVerifierContract, (&admin, &game_hub));
        let client = MineGameVerifierContractClient::new(&env, &contract_id);

        let ultrahonk_addr = env.register(MockUltraHonkVerifier, ());
        client.set_ultrahonk_address(&ultrahonk_addr);

        let commitment_arr: [u8; 32] = [0xaa; 32];
        let real_outputs = sample_outputs(&env);
        let proof_blob = build_proof_blob_with_outputs(&env, &commitment_arr, &real_outputs);

        // Claim different outputs than what's in the proof
        let tampered_outputs = ProofOutputs {
            move_sequence: vec![&env, 2, 4],
            resources_per_node: vec![&env, 40, 20],
            total_resources: 999,
            final_hull: 8,
            final_fuel: 3,
            outcome: 0,
            evac_intensity: 1,
        };

        let player = Address::generate(&env);

        let ok = client.verify(
            &1u32,
            &player,
            &Bytes::from_array(&env, &[1]),
            &proof_blob,
            &Bytes::from_array(&env, &commitment_arr),
            &tampered_outputs,
        );
        assert!(!ok);
    }

    #[test]
    fn verify_returns_false_when_ultrahonk_rejects() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let game_hub = Address::generate(&env);
        let contract_id = env.register(MineGameVerifierContract, (&admin, &game_hub));
        let client = MineGameVerifierContractClient::new(&env, &contract_id);

        let ultrahonk_addr = env.register(FailingUltraHonkVerifier, ());
        client.set_ultrahonk_address(&ultrahonk_addr);

        let commitment_arr: [u8; 32] = [0xcc; 32];
        let outputs = sample_outputs(&env);
        let proof_blob = build_proof_blob_with_outputs(&env, &commitment_arr, &outputs);

        let player = Address::generate(&env);

        let ok = client.verify(
            &1u32,
            &player,
            &Bytes::from_array(&env, &[1]),
            &proof_blob,
            &Bytes::from_array(&env, &commitment_arr),
            &outputs,
        );
        assert!(!ok);
    }

    #[test]
    fn verify_rejects_short_proof_blob() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let game_hub = Address::generate(&env);
        let contract_id = env.register(MineGameVerifierContract, (&admin, &game_hub));
        let client = MineGameVerifierContractClient::new(&env, &contract_id);

        let ultrahonk_addr = env.register(MockUltraHonkVerifier, ());
        client.set_ultrahonk_address(&ultrahonk_addr);

        let player = Address::generate(&env);
        let outputs = sample_outputs(&env);

        let ok = client.verify(
            &1u32,
            &player,
            &Bytes::from_array(&env, &[1]),
            &Bytes::from_array(&env, &[0, 0, 0, 57]),
            &Bytes::from_array(&env, &[0xaa; 32]),
            &outputs,
        );
        assert!(!ok);
    }

    #[test]
    fn can_set_and_get_ultrahonk_address() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let game_hub = Address::generate(&env);
        let contract_id = env.register(MineGameVerifierContract, (&admin, &game_hub));
        let client = MineGameVerifierContractClient::new(&env, &contract_id);

        assert_eq!(client.get_ultrahonk_address(), None);

        let addr = Address::generate(&env);
        client.set_ultrahonk_address(&addr);
        assert_eq!(client.get_ultrahonk_address(), Some(addr));
    }
}
