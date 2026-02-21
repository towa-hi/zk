import { config } from '@/config';
import type { ProofPayload } from './engine';

export interface ContractActionResult {
  ok: boolean;
  status: 'submitted' | 'skipped' | 'failed';
  message: string;
  txHash?: string;
}

export interface MineGameContractTransport {
  commitLoadout: (args: {
    sessionId: number;
    playerAddress: string;
    commitment: string;
  }) => Promise<ContractActionResult>;
  submitProof: (args: {
    sessionId: number;
    playerAddress: string;
    payload: ProofPayload;
  }) => Promise<ContractActionResult>;
}

function createNoopTransport(): MineGameContractTransport {
  return {
    commitLoadout: async () => ({
      ok: true,
      status: 'skipped',
      message: 'commit_loadout not wired yet (noop transport)',
    }),
    submitProof: async () => ({
      ok: true,
      status: 'skipped',
      message: 'submit_proof not wired yet (noop transport)',
    }),
  };
}

export interface CreateMineGameContractAdapterInput {
  contractId?: string;
  transport?: MineGameContractTransport;
}

export interface MineGameContractAdapter {
  getContractId: () => string;
  commitLoadout: (args: {
    sessionId: number;
    playerAddress: string;
    commitment: string | null;
  }) => Promise<ContractActionResult>;
  submitProof: (args: {
    sessionId: number;
    playerAddress: string;
    payload: ProofPayload | null;
  }) => Promise<ContractActionResult>;
}

export function createMineGameContractAdapter(
  input: CreateMineGameContractAdapterInput = {}
): MineGameContractAdapter {
  const contractId = input.contractId ?? config.mineGameId ?? '';
  const transport = input.transport ?? createNoopTransport();

  return {
    getContractId: () => contractId,
    commitLoadout: async ({ sessionId, playerAddress, commitment }) => {
      if (!contractId) {
        return {
          ok: true,
          status: 'skipped',
          message: 'No mine-game contract configured; skipping commit',
        };
      }
      if (!commitment) {
        return {
          ok: false,
          status: 'failed',
          message: 'Missing commitment',
        };
      }
      return transport.commitLoadout({
        sessionId,
        playerAddress,
        commitment,
      });
    },
    submitProof: async ({ sessionId, playerAddress, payload }) => {
      if (!contractId) {
        return {
          ok: true,
          status: 'skipped',
          message: 'No mine-game contract configured; skipping proof submit',
        };
      }
      if (!payload) {
        return {
          ok: false,
          status: 'failed',
          message: 'Missing proof payload',
        };
      }
      return transport.submitProof({
        sessionId,
        playerAddress,
        payload,
      });
    },
  };
}
