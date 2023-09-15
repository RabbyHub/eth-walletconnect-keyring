import { ProposalTypes, SessionTypes } from '@walletconnect/types';
import {
  BuildInWalletPeerName,
  COMMON_WALLETCONNECT,
  IGNORE_CHECK_WALLET,
  buildInWallets
} from './type';

const DEFAULT_MAIN_CHAINS = [
  'eip155:1',
  'eip155:10',
  'eip155:100',
  'eip155:137',
  'eip155:42161',
  'eip155:42220'
];

export const getNamespacesFromChains = (chains: string[]) => {
  const supportedNamespaces: string[] = [];
  chains.forEach((chainId) => {
    const [namespace] = chainId.split(':');
    if (!supportedNamespaces.includes(namespace)) {
      supportedNamespaces.push(namespace);
    }
  });

  return supportedNamespaces;
};

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
export enum DEFAULT_EIP155_METHODS {
  ETH_SEND_TRANSACTION = 'eth_sendTransaction',
  ETH_SIGN_TRANSACTION = 'eth_signTransaction',
  PERSONAL_SIGN = 'personal_sign',
  ETH_SIGN_TYPED_DATA = 'eth_signTypedData'
}

export enum DEFAULT_EIP_155_EVENTS {
  ETH_CHAIN_CHANGED = 'chainChanged',
  ETH_ACCOUNTS_CHANGED = 'accountsChanged'
}

export const getSupportedMethodsByNamespace = (namespace: string) => {
  switch (namespace) {
    case 'eip155':
      return Object.values(DEFAULT_EIP155_METHODS);
    default:
      throw new Error(`No default methods for namespace: ${namespace}`);
  }
};

export const getSupportedEventsByNamespace = (namespace: string) => {
  switch (namespace) {
    case 'eip155':
      return Object.values(DEFAULT_EIP_155_EVENTS);
    default:
      throw new Error(`No default events for namespace: ${namespace}`);
  }
};

export const getRequiredNamespaces = (
  chains: string[] = DEFAULT_MAIN_CHAINS
): ProposalTypes.RequiredNamespaces => {
  const selectedNamespaces = getNamespacesFromChains(chains);

  return Object.fromEntries(
    selectedNamespaces.map((namespace) => [
      namespace,
      {
        methods: getSupportedMethodsByNamespace(namespace),
        chains: chains.filter((chain) => chain.startsWith(namespace)),
        events: getSupportedEventsByNamespace(namespace) as any[]
      }
    ])
  );
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
