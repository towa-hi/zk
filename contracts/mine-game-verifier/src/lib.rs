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
    Router,
    ImageId,
}

#[contractclient(name = "Risc0VerifierClient")]
pub trait Risc0Verifier {
    fn verify(env: Env, seal: Bytes, image_id: BytesN<32>, journal: BytesN<32>);
}

#[contractimpl]
impl MineGameVerifierContract {
    /// Keep deploy interface compatible with existing game deploy tooling.
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

    /// Set the single accepted image ID for all proof verifications.
    pub fn set_image_id(env: Env, image_id: BytesN<32>) {
        require_admin(&env);
        env.storage().instance().set(&DataKey::ImageId, &image_id);
    }

    pub fn get_image_id(env: Env) -> Option<BytesN<32>> {
        env.storage().instance().get(&DataKey::ImageId)
    }

    /// Set the address of an external RISC0 verifier/router contract.
    pub fn set_router(env: Env, router: Address) {
        require_admin(&env);
        env.storage().instance().set(&DataKey::Router, &router);
    }

    pub fn get_router(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Router)
    }

    /// Accepts `proof_payload` in adapter format: `journal_digest(32 bytes) || seal_bytes`.
    ///
    /// If router/image_id are not configured yet, this returns true to keep development
    /// flow unblocked while wiring the full prover + verifier pipeline.
    pub fn verify(
        env: Env,
        session_id: u32,
        player: Address,
        proof_payload: Bytes,
        commitment: Bytes,
        _outputs: ProofOutputs,
    ) -> bool {
        let router: Option<Address> = env.storage().instance().get(&DataKey::Router);
        let image_id: Option<BytesN<32>> = env.storage().instance().get(&DataKey::ImageId);

        let (router, image_id) = match (router, image_id) {
            (Some(router), Some(image_id)) => (router, image_id),
            _ => return false,
        };

        let (journal, seal) = match parse_risc0_payload(&proof_payload) {
            Some(parts) => parts,
            None => return false,
        };
        let expected_journal = compute_expected_journal(&env, session_id, &player, &commitment);
        if journal != expected_journal {
            return false;
        }

        let client = Risc0VerifierClient::new(&env, &router);
        client.try_verify(&seal, &image_id, &journal).is_ok()
    }
}

fn parse_risc0_payload(payload: &Bytes) -> Option<(BytesN<32>, Bytes)> {
    if payload.len() <= 32 {
        return None;
    }
    let journal_bytes = payload.slice(0..32);
    let journal = BytesN::<32>::try_from(journal_bytes).ok()?;
    let seal = payload.slice(32..payload.len());
    Some((journal, seal))
}

fn require_admin(env: &Env) {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("admin not set");
    admin.require_auth();
}

fn compute_expected_journal(
    env: &Env,
    session_id: u32,
    player: &Address,
    commitment: &Bytes,
) -> BytesN<32> {
    let mut preimage = Bytes::new(env);
    preimage.append(&Bytes::from_array(env, &session_id.to_be_bytes()));
    preimage.append(&player.to_string().to_bytes());
    preimage.append(commitment);
    env.crypto().keccak256(&preimage).into()
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{contract, contractimpl};

    #[contract]
    struct MockRisc0Verifier;

    #[contractimpl]
    impl MockRisc0Verifier {
        pub fn verify(_env: Env, _seal: Bytes, _image_id: BytesN<32>, _journal: BytesN<32>) {}
    }

    #[test]
    fn verify_returns_false_when_not_fully_configured() {
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
            &outputs,
        );

        assert!(!ok);
    }

    #[test]
    fn can_set_and_get_single_image_id() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let game_hub = Address::generate(&env);
        let contract_id = env.register(MineGameVerifierContract, (&admin, &game_hub));
        let client = MineGameVerifierContractClient::new(&env, &contract_id);

        let image_id = BytesN::from_array(&env, &[7u8; 32]);
        client.set_image_id(&image_id);

        let got = client.get_image_id();
        assert_eq!(got, Some(image_id));
    }

    #[test]
    fn verify_rejects_malformed_payload() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let game_hub = Address::generate(&env);
        let contract_id = env.register(MineGameVerifierContract, (&admin, &game_hub));
        let client = MineGameVerifierContractClient::new(&env, &contract_id);

        let router = env.register(MockRisc0Verifier, ());
        client.set_router(&router);
        client.set_image_id(&BytesN::from_array(&env, &[9u8; 32]));

        let player = Address::generate(&env);
        let ok = client.verify(
            &7u32,
            &player,
            &Bytes::from_array(&env, &[1, 2, 3]),
            &Bytes::from_array(&env, &[4, 5, 6]),
            &ProofOutputs {
                move_sequence: Vec::new(&env),
                resources_per_node: Vec::new(&env),
                total_resources: 0,
                final_hull: 0,
                final_fuel: 0,
                outcome: 0,
                evac_intensity: 0,
            },
        );

        assert!(!ok);
    }

    #[test]
    fn verify_rejects_when_journal_not_bound_to_commitment() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let game_hub = Address::generate(&env);
        let contract_id = env.register(MineGameVerifierContract, (&admin, &game_hub));
        let client = MineGameVerifierContractClient::new(&env, &contract_id);

        let router = env.register(MockRisc0Verifier, ());
        client.set_router(&router);
        client.set_image_id(&BytesN::from_array(&env, &[9u8; 32]));

        let player = Address::generate(&env);
        let commitment = Bytes::from_array(&env, &[0xaa, 0xbb, 0xcc]);
        let mut bad_payload = Bytes::new(&env);
        bad_payload.append(&Bytes::from_array(&env, &[0u8; 32]));
        bad_payload.append(&Bytes::from_array(&env, &[1u8, 2u8, 3u8]));
        let ok = client.verify(
            &42u32,
            &player,
            &bad_payload,
            &commitment,
            &ProofOutputs {
                move_sequence: Vec::new(&env),
                resources_per_node: Vec::new(&env),
                total_resources: 0,
                final_hull: 0,
                final_fuel: 0,
                outcome: 0,
                evac_intensity: 0,
            },
        );
        assert!(!ok);
    }

    #[test]
    fn verify_accepts_when_payload_is_well_formed_and_bound() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let game_hub = Address::generate(&env);
        let contract_id = env.register(MineGameVerifierContract, (&admin, &game_hub));
        let client = MineGameVerifierContractClient::new(&env, &contract_id);

        let router = env.register(MockRisc0Verifier, ());
        client.set_router(&router);
        client.set_image_id(&BytesN::from_array(&env, &[9u8; 32]));

        let session_id = 42u32;
        let player = Address::generate(&env);
        let commitment = Bytes::from_array(&env, &[0xaa, 0xbb, 0xcc]);
        let expected = compute_expected_journal(&env, session_id, &player, &commitment);
        let mut payload = Bytes::new(&env);
        payload.append(&Bytes::from(expected.clone()));
        payload.append(&Bytes::from_array(&env, &[1u8, 2u8, 3u8]));

        let ok = client.verify(
            &session_id,
            &player,
            &payload,
            &commitment,
            &ProofOutputs {
                move_sequence: Vec::new(&env),
                resources_per_node: Vec::new(&env),
                total_resources: 0,
                final_hull: 0,
                final_fuel: 0,
                outcome: 0,
                evac_intensity: 0,
            },
        );
        assert!(ok);
    }
}
