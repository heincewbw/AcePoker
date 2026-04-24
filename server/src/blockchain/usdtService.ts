import { ethers } from 'ethers';

const USDT_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

const NETWORK_CONFIG = {
  BSC: {
    rpcUrl: process.env.USE_TESTNET === 'true'
      ? process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/'
      : process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org/',
    usdtAddress: process.env.USE_TESTNET === 'true'
      ? process.env.USDT_CONTRACT_ADDRESS_BSC_TESTNET || '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'
      : process.env.USDT_CONTRACT_ADDRESS_BSC || '0x55d398326f99059fF775485246999027B3197955',
    chainId: process.env.USE_TESTNET === 'true' ? 97 : 56,
  },
  ETH: {
    rpcUrl: process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com',
    usdtAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    chainId: 1,
  },
  POLYGON: {
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    usdtAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    chainId: 137,
  },
};

export interface DepositVerificationResult {
  valid: boolean;
  amount?: number;
  from?: string;
  to?: string;
  confirmations?: number;
  error?: string;
}

export class UsdtService {
  private provider: ethers.JsonRpcProvider;
  private usdtContract: ethers.Contract;
  private network: string;

  constructor(network: 'BSC' | 'ETH' | 'POLYGON' = 'BSC') {
    const config = NETWORK_CONFIG[network];
    this.network = network;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.usdtContract = new ethers.Contract(config.usdtAddress, USDT_ABI, this.provider);
  }

  static getContractAddress(network: string): string {
    const config = NETWORK_CONFIG[network as keyof typeof NETWORK_CONFIG];
    return config?.usdtAddress || NETWORK_CONFIG.BSC.usdtAddress;
  }

  async verifyDeposit(
    txHash: string,
    _userId: string
  ): Promise<DepositVerificationResult> {
    try {
      const platformAddress = process.env.PLATFORM_WALLET_ADDRESS?.toLowerCase();
      if (!platformAddress) {
        return { valid: false, error: 'Platform wallet not configured' };
      }

      const tx = await this.provider.getTransaction(txHash);
      if (!tx) {
        return { valid: false, error: 'Transaction not found on blockchain' };
      }

      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt) {
        return { valid: false, error: 'Transaction not yet confirmed' };
      }

      if (receipt.status !== 1) {
        return { valid: false, error: 'Transaction failed on blockchain' };
      }

      // Parse Transfer events from the tx receipt
      const transferInterface = new ethers.Interface(USDT_ABI);
      let transferAmount = BigInt(0);
      let fromAddress = '';
      let toAddress = '';

      for (const log of receipt.logs) {
        try {
          const parsed = transferInterface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed && parsed.name === 'Transfer') {
            const to = (parsed.args[1] as string).toLowerCase();
            if (to === platformAddress) {
              transferAmount = parsed.args[2] as bigint;
              fromAddress = (parsed.args[0] as string).toLowerCase();
              toAddress = to;
              break;
            }
          }
        } catch {
          // Not a matching log
        }
      }

      if (transferAmount === BigInt(0)) {
        return { valid: false, error: 'No USDT transfer to platform wallet found in this transaction' };
      }

      // Convert from 18 decimals (BSC USDT) to human-readable
      const decimals = this.network === 'ETH' ? 6 : 18;
      const amount = Number(ethers.formatUnits(transferAmount, decimals));

      const latestBlock = await this.provider.getBlockNumber();
      const confirmations = latestBlock - receipt.blockNumber;

      if (confirmations < 3) {
        return { valid: false, error: `Only ${confirmations} confirmations. Need at least 3.` };
      }

      return {
        valid: true,
        amount,
        from: fromAddress,
        to: toAddress,
        confirmations,
      };
    } catch (err) {
      console.error('USDT verification error:', err);
      return { valid: false, error: 'Failed to verify transaction. Please try again.' };
    }
  }

  async getUsdtBalance(walletAddress: string): Promise<number> {
    try {
      const balance = await this.usdtContract.balanceOf(walletAddress);
      const decimals = this.network === 'ETH' ? 6 : 18;
      return Number(ethers.formatUnits(balance, decimals));
    } catch {
      return 0;
    }
  }
}
