import { useState } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';

const USDT_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// BSC Mainnet USDT
const BSC_USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
// BSC Testnet USDT
const BSC_TESTNET_USDT_ADDRESS = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';

const BSC_CHAIN_ID = '0x38';
const BSC_TESTNET_CHAIN_ID = '0x61';

export interface Web3State {
  address: string | null;
  balance: string | null;
  usdtBalance: string | null;
  isConnecting: boolean;
  network: string | null;
}

export function useWeb3() {
  const [state, setState] = useState<Web3State>({
    address: null,
    balance: null,
    usdtBalance: null,
    isConnecting: false,
    network: null,
  });

  const connectWallet = async (): Promise<string | null> => {
    if (!window.ethereum) {
      toast.error('MetaMask not found. Please install MetaMask.');
      return null;
    }

    setState((s) => ({ ...s, isConnecting: true }));

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);

      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const balance = ethers.formatEther(await provider.getBalance(address));

      // Try to get USDT balance
      let usdtBalance = '0';
      try {
        const isTestnet = network.chainId === BigInt(97);
        const usdtAddress = isTestnet ? BSC_TESTNET_USDT_ADDRESS : BSC_USDT_ADDRESS;
        const usdt = new ethers.Contract(usdtAddress, USDT_ABI, provider);
        const rawBalance = await usdt.balanceOf(address);
        const decimals = await usdt.decimals();
        usdtBalance = ethers.formatUnits(rawBalance, decimals);
      } catch {
        // Not on BSC or USDT not available
      }

      setState({
        address,
        balance,
        usdtBalance,
        isConnecting: false,
        network: network.name,
      });

      return address;
    } catch (err: any) {
      setState((s) => ({ ...s, isConnecting: false }));
      toast.error(err.message || 'Failed to connect wallet');
      return null;
    }
  };

  const switchToBSC = async (testnet = false): Promise<boolean> => {
    if (!window.ethereum) return false;

    const chainId = testnet ? BSC_TESTNET_CHAIN_ID : BSC_CHAIN_ID;
    const chainName = testnet ? 'BSC Testnet' : 'BNB Smart Chain';
    const rpcUrl = testnet
      ? 'https://data-seed-prebsc-1-s1.binance.org:8545/'
      : 'https://bsc-dataseed.binance.org/';
    const explorerUrl = testnet
      ? 'https://testnet.bscscan.com'
      : 'https://bscscan.com';

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId }],
      });
      return true;
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId,
              chainName,
              nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
              rpcUrls: [rpcUrl],
              blockExplorerUrls: [explorerUrl],
            }],
          });
          return true;
        } catch {
          toast.error('Failed to add BSC network');
          return false;
        }
      }
      toast.error('Failed to switch network');
      return false;
    }
  };

  const sendUsdt = async (
    toAddress: string,
    amount: string,
    testnet = false
  ): Promise<string | null> => {
    if (!window.ethereum) {
      toast.error('MetaMask not found');
      return null;
    }

    try {
      const switched = await switchToBSC(testnet);
      if (!switched) return null;

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const usdtAddress = testnet ? BSC_TESTNET_USDT_ADDRESS : BSC_USDT_ADDRESS;
      const usdt = new ethers.Contract(usdtAddress, USDT_ABI, signer);

      const decimals = await usdt.decimals();
      const amountWei = ethers.parseUnits(amount, decimals);

      toast.loading('Sending USDT... Please confirm in MetaMask', { id: 'tx' });
      const tx = await usdt.transfer(toAddress, amountWei);

      toast.loading('Waiting for confirmation...', { id: 'tx' });
      await tx.wait();

      toast.success('USDT sent successfully!', { id: 'tx' });
      return tx.hash;
    } catch (err: any) {
      toast.dismiss('tx');
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error(err.message || 'Transaction failed');
      }
      return null;
    }
  };

  const disconnectWallet = () => {
    setState({ address: null, balance: null, usdtBalance: null, isConnecting: false, network: null });
  };

  return { ...state, connectWallet, switchToBSC, sendUsdt, disconnectWallet };
}

// Extend Window for ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
