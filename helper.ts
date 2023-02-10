import { ProposalTypes } from '@walletconnect/types';

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
  console.log('selected namespaces:', selectedNamespaces);

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
