import { ProposalTypes, SessionTypes } from '@walletconnect/types';
import {
  BuildInWalletPeerName,
  COMMON_WALLETCONNECT,
  IGNORE_CHECK_WALLET,
  buildInWallets
} from './type';
import {
  OPTIONAL_EVENTS,
  OPTIONAL_METHODS,
  REQUIRED_EVENTS,
  REQUIRED_METHODS
} from './rpc';

export const parseNamespaces = (namespaces: SessionTypes.Namespaces) => {
  const allNamespaceAccounts = Object.values(namespaces)
    .map((namespace) => namespace.accounts)
    .flat();

  const accounts = allNamespaceAccounts.map((account) => {
    const [namespace, chainId, address] = account.split(':');
    return { address, chainId: Number(chainId), namespace };
  });

  return accounts;
};

/**
 * EIP155
 */

export enum DEFAULT_EIP_155_EVENTS {
  ETH_CHAIN_CHANGED = 'chainChanged',
  ETH_ACCOUNTS_CHANGED = 'accountsChanged'
}

export const getNamespaces = (
  chains: number[]
): ProposalTypes.RequiredNamespaces => {
  return {
    eip155: {
      methods: OPTIONAL_METHODS,
      chains: chains.map((chain) => `eip155:${chain}`),
      events: OPTIONAL_EVENTS
    }
  };
};

export const getRequiredNamespaces = (): ProposalTypes.RequiredNamespaces => {
  return {
    eip155: {
      methods: REQUIRED_METHODS,
      chains: ['eip155:1'],
      events: REQUIRED_EVENTS
    }
  };
};

export function sanitizeHex(hex?: string) {
  if (!hex) return;
  hex = hex.substring(0, 2) === '0x' ? hex.substring(2) : hex;
  if (hex === '') {
    return '';
  }
  hex = hex.length % 2 !== 0 ? '0' + hex : hex;
  return '0x' + hex;
}

export function getBuildInBrandName(
  brandName: string,
  realBrandName?: string,
  patchCheckWalletConnect?: boolean
) {
  if (patchCheckWalletConnect) {
    // is desktop
    if (brandName === 'WalletConnect') return brandName;
  }

  if (!COMMON_WALLETCONNECT.includes(brandName)) {
    return brandName;
  }

  const lowerName = realBrandName?.toLowerCase();
  if (!lowerName) return brandName;
  let buildIn = buildInWallets.find((item) => {
    const lowerItem = item.toLowerCase();
    return lowerItem.includes(lowerName) || lowerName.includes(lowerItem);
  });

  if (lowerName.includes('tokenpocket')) {
    return 'TP';
  }
  if (lowerName.includes('trust wallet')) {
    return 'TRUSTWALLET';
  }

  return buildIn || brandName;
}

export function checkBrandName(brandName: string, metaDataName: string) {
  // just check if brandName is in name or name is in brandName
  let lowerName = metaDataName?.toLowerCase() as string;
  if (!lowerName) {
    lowerName = brandName;
  }
  const peerName = BuildInWalletPeerName[brandName]?.toLowerCase() as
    | string
    | undefined;
  if (IGNORE_CHECK_WALLET.includes(brandName)) return true;

  if (peerName?.includes(lowerName) || lowerName?.includes(peerName ?? '')) {
    return true;
  }

  return false;
}
