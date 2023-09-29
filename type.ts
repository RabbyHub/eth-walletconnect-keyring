import { CoreTypes } from '@walletconnect/types';

export const WALLETCONNECT_STATUS_MAP = {
  PENDING: 1,
  CONNECTED: 2,
  WAITING: 3,
  SIBMITTED: 4,
  REJECTED: 5,
  FAILD: 6
};

export const WALLETCONNECT_SESSION_STATUS_MAP = {
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  RECEIVED: 'RECEIVED',
  EXPIRED: 'EXPIRED',
  ACCOUNT_ERROR: 'ACCOUNT_ERROR',
  BRAND_NAME_ERROR: 'BRAND_NAME_ERROR',
  REJECTED: 'REJECTED',
  ADDRESS_DUPLICATE: 'ADDRESS_DUPLICATE'
};

export interface Account {
  brandName: string;
  address: string;
  realBrandName?: string;
  realBrandUrl?: string;
}

export interface ConstructorOptions {
  accounts?: Account[];
  brandName?: string;
  clientMeta: CoreTypes.Metadata;
  maxDuration?: number;
  projectId: string;
  v2Whitelist: string[];
}

export const COMMON_WALLETCONNECT = ['WALLETCONNECT', 'WalletConnect'];

export const BuildInWalletPeerName = {
  MetaMask: 'MetaMask',
  TP: 'TokenPocket',
  TRUSTWALLET: 'Trust Wallet',
  MATHWALLET: 'MathWallet',
  IMTOKEN: 'imToken',
  Rainbow: 'Rainbow',
  Bitkeep: 'Bitget',
  Uniswap: 'Uniswap',
  Zerion: 'Zerion'
};

export const buildInWallets = Object.keys(BuildInWalletPeerName);
export const IGNORE_CHECK_WALLET = ['FIREBLOCKS', 'JADE', 'AMBER', 'COBO'];
