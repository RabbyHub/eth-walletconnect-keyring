// https://github.com/MetaMask/eth-simple-keyring#the-keyring-class-protocol
import { EventEmitter } from 'events';
import { isAddress } from 'web3-utils';
import { addHexPrefix } from 'ethereumjs-util';
import { SessionTypes } from '@walletconnect/types';
import {
  TypedTransaction,
  JsonTx,
  Transaction,
  FeeMarketEIP1559Transaction
} from '@ethereumjs/tx';
import SignClient from '@walletconnect/sign-client';
import { getSdkError } from '@walletconnect/utils';
import { getRequiredNamespaces, wait } from './helper';

export const isBrowser = () => typeof window !== 'undefined';

export const keyringType = 'WalletConnect';

export const WALLETCONNECT_STATUS_MAP = {
  PENDING: 1,
  CONNECTED: 2,
  WAITING: 3,
  SIBMITTED: 4,
  REJECTED: 5,
  FAILD: 6
};

export const DEFAULT_BRIDGE = 'https://bridge.walletconnect.org';
export const OLD_DEFAULT_BRIDGE = 'https://wallet.rabby.io:10086/';

function sanitizeHex(hex: string): string {
  hex = hex.substring(0, 2) === '0x' ? hex.substring(2) : hex;
  if (hex === '') {
    return '';
  }
  hex = hex.length % 2 !== 0 ? '0' + hex : hex;
  return '0x' + hex;
}

export interface Account {
  brandName: string;
  address: string;
  bridge?: string;
}

interface ConstructorOptions {
  accounts: Account[];
  brandName: string;
  clientMeta: any;
  maxDuration?: number;
}

type ValueOf<T> = T[keyof T];

interface Connector {
  connector: SignClient;
  status: ValueOf<typeof WALLETCONNECT_STATUS_MAP>;
  brandName: string;
  session: SessionTypes.Struct;
  chainIds: number[];
  namespace: string;
}

class WalletConnectKeyring extends EventEmitter {
  static type = keyringType;
  type = keyringType;
  accounts: Account[] = [];
  accountToAdd: Account | null = null;
  resolvePromise: null | ((value: any) => void) = null;
  rejectPromise: null | ((value: any) => void) = null;
  onAfterConnect:
    | null
    | ((payload: {
        address: string;
        chainIds: number[];
        namespace: string;
        session: SessionTypes.Struct;
      }) => void) = null;
  onDisconnect: null | ((err: any) => void) = null;
  currentConnectStatus: number = WALLETCONNECT_STATUS_MAP.PENDING;
  maxDuration = 1800000; // 30 mins hour by default
  clientMeta: any | null = null;
  currentConnector: Connector | null = null;
  connectors: Record<string, Connector> = {};

  constructor(opts: ConstructorOptions) {
    super();
    this.deserialize(opts);
  }

  serialize() {
    return Promise.resolve({
      accounts: this.accounts
    });
  }

  async deserialize(opts: ConstructorOptions) {
    if (opts?.accounts) {
      this.accounts = opts.accounts;
    }
    if (opts?.clientMeta) {
      this.clientMeta = opts.clientMeta;
    }
  }

  setAccountToAdd = (account: Account) => {
    this.accountToAdd = {
      ...account,
      address: account.address.toLowerCase()
    };
  };

  private parseNamespaces = (namespaces: SessionTypes.Namespaces) => {
    const allNamespaceAccounts = Object.values(namespaces)
      .map((namespace) => namespace.accounts)
      .flat();

    const accounts = allNamespaceAccounts.map((account) => {
      const [namespace, chainId, address] = account.split(':');
      return { address, chainId: Number(chainId), namespace };
    });

    return accounts;
  };

  initConnector = async (brandName: string) => {
    let address: string | null = null;
    const { connector, uri } = await this.createConnector(brandName);
    this.onAfterConnect = (account) => {
      address = account?.address;
      this.currentConnector = this.connectors[
        `${brandName}-${address!.toLowerCase()}`
      ] = {
        status: WALLETCONNECT_STATUS_MAP.CONNECTED,
        connector,
        brandName,
        session: account.session,
        chainIds: account.chainIds,
        namespace: account.namespace
      };

      this.updateCurrentStatus(
        WALLETCONNECT_STATUS_MAP.CONNECTED,
        undefined,
        address
      );
    };
    this.onDisconnect = (error) => {
      if (address) {
        const connector =
          this.connectors[`${brandName}-${address.toLowerCase()}`];
        if (connector) {
          this.closeConnector(connector, address, brandName);
        }
      }
      this.updateCurrentStatus(
        WALLETCONNECT_STATUS_MAP.FAILD,
        undefined,
        error
      );
    };

    return { connector, uri };
  };

  private async initSDK(chainId?: number) {
    if (isBrowser() && localStorage.getItem('walletconnect')) {
      // always clear walletconnect cache
      localStorage.removeItem('walletconnect');
    }

    const connector = await SignClient.init({
      projectId: 'ed21a1293590bdc995404dff7e033f04',
      metadata: this.clientMeta!
    });

    const requiredNamespaces = getRequiredNamespaces(
      chainId ? [`eip155:${chainId}`] : undefined
    );

    const result = await connector.connect({
      requiredNamespaces
    });

    return {
      connector,
      ...result
    };
  }

  async connectSDK() {
    const result = await this.initSDK(1);

    result.approval().then((res) => {
      const accounts = this.parseNamespaces(res.namespaces);
      const [account] = accounts;
      this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.CONNECTED, undefined, {
        address: account.address,
        topic: res.topic
      });
      this.currentConnector = {
        status: WALLETCONNECT_STATUS_MAP.PENDING,
        connector: result.connector,
        session: res,
        chainIds: accounts.map((account) => account.chainId),
        brandName: 'walletconnect',
        namespace: account.namespace
      };
    });

    return result.uri;
  }

  async disconnectSDK() {
    this.closeConnector(this.currentConnector!);
  }

  createConnector = async (brandName: string, chainId?: number) => {
    const result = await this.initSDK(chainId);

    result
      .approval()
      .then((res) => {
        const accounts = this.parseNamespaces(res.namespaces);
        const [account] = accounts;
        if (account) {
          const conn: Connector = {
            connector: result.connector,
            status: WALLETCONNECT_STATUS_MAP.CONNECTED,
            brandName,
            session: res,
            chainIds: accounts.map((account) => account.chainId),
            namespace: account.namespace
          };
          this.connectors[`${brandName}-${account.address.toLowerCase()}`] =
            conn;

          this.currentConnector = conn;

          setTimeout(() => {
            this.closeConnector(conn, account.address, brandName);
          }, this.maxDuration);
        }
        this.onAfterConnect?.({
          ...account,
          chainIds: accounts.map((account) => account.chainId),
          session: res
        });
      })
      .catch((error) => {
        this.onDisconnect?.(error);
      });

    return { connector: result.connector, uri: result.uri };
  };

  closeConnector = async (
    connector: Connector,
    address?: string,
    brandName?: string
  ) => {
    try {
      if (connector.session?.topic) {
        await connector.connector.disconnect({
          topic: connector.session.topic,
          reason: getSdkError('USER_DISCONNECTED')
        });
      }
    } catch (e) {
      // NOTHING
    }
    if (address) {
      delete this.connectors[`${brandName}-${address.toLowerCase()}`];
    }
  };

  init = async (address: string, brandName: string, chainId: number) => {
    if (isBrowser() && localStorage.getItem('walletconnect')) {
      // always clear walletconnect cache
      localStorage.removeItem('walletconnect');
    }

    const account = this.accounts.find(
      (acc) =>
        acc.address.toLowerCase() === address.toLowerCase() &&
        acc.brandName === brandName
    );

    if (!account) {
      throw new Error('Can not find this address');
    }

    const connector =
      this.connectors[`${brandName}-${account.address.toLowerCase()}`];
    if (!connector || connector.chainIds.indexOf(chainId) === -1) {
      if (connector) {
        connector.status = WALLETCONNECT_STATUS_MAP.PENDING;
        await this.closeConnector(connector, account.address, brandName);
      }
      const newConnector = await this.createConnector(brandName, chainId);
      this.emit('inited', { uri: newConnector.uri, chainId });
      this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.PENDING, account);
    } else {
      connector.status = WALLETCONNECT_STATUS_MAP.CONNECTED;
      this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.CONNECTED, account);
      this.onAfterConnect &&
        this.onAfterConnect({
          address: account.address,
          chainIds: connector.chainIds,
          namespace: connector.namespace,
          session: connector.session
        });
    }
    this.currentConnector = connector;

    return connector;
  };

  getConnectorStatus = (address: string, brandName: string) => {
    const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
    if (connector) {
      return connector.status;
    }
    return null;
  };

  addAccounts = async () => {
    if (!this.accountToAdd) throw new Error('There is no address to add');

    if (!isAddress(this.accountToAdd.address)) {
      throw new Error("The address you're are trying to import is invalid");
    }
    const prefixedAddress = addHexPrefix(this.accountToAdd.address);

    if (
      this.accounts.find(
        (acct) =>
          acct.address.toLowerCase() === prefixedAddress.toLowerCase() &&
          acct.brandName === this.accountToAdd?.brandName
      )
    ) {
      throw new Error("The address you're are trying to import is duplicate");
    }

    this.accounts.push({
      address: prefixedAddress,
      brandName: this.accountToAdd.brandName
    });

    return [prefixedAddress];
  };

  // pull the transaction current state, then resolve or reject
  async signTransaction(
    address,
    transaction: TypedTransaction,
    { brandName = 'JADE' }: { brandName: string }
  ) {
    const account = this.accounts.find(
      (acct) =>
        acct.address.toLowerCase() === address.toLowerCase() &&
        acct.brandName === brandName
    );
    if (!account) {
      throw new Error('Can not find this address');
    }

    const txData: JsonTx = {
      to: transaction.to!.toString(),
      value: `0x${transaction.value.toString('hex')}`,
      data: `0x${transaction.data.toString('hex')}`,
      nonce: `0x${transaction.nonce.toString('hex')}`,
      gasLimit: `0x${transaction.gasLimit.toString('hex')}`,
      gasPrice: `0x${
        (transaction as Transaction).gasPrice
          ? (transaction as Transaction).gasPrice.toString('hex')
          : (transaction as FeeMarketEIP1559Transaction).maxFeePerGas.toString(
              'hex'
            )
      }`
    };
    const txChainId = transaction.common.chainIdBN().toNumber();
    this.onAfterConnect = async (payload) => {
      if (!this.currentConnector) throw new Error('No connector avaliable');

      this.updateCurrentStatus(
        WALLETCONNECT_STATUS_MAP.CONNECTED,
        account,
        payload
      );

      await wait(() => {
        this.updateCurrentStatus(
          WALLETCONNECT_STATUS_MAP.WAITING,
          account,
          payload
        );
      }, 1000);

      if (payload) {
        if (
          payload.address.toLowerCase() !== address.toLowerCase() ||
          payload.chainIds.indexOf(txChainId) === -1
        ) {
          this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.FAILD, account, {
            message: 'Wrong address or chainId',
            code:
              payload.address.toLowerCase() === address.toLowerCase()
                ? 1000
                : 1001
          });
          return;
        }
        this.currentConnector.chainIds = payload.chainIds;
      }
      try {
        const result = await this.currentConnector.connector.request({
          request: {
            method: 'eth_sendTransaction',
            params: [
              {
                data: this._normalize(txData.data),
                from: address,
                gas: this._normalize(txData.gasLimit),
                gasPrice: this._normalize(txData.gasPrice),
                nonce: this._normalize(txData.nonce),
                to: this._normalize(txData.to),
                value: this._normalize(txData.value) || '0x0' // prevent 0x
              }
            ]
          },
          topic: payload.session.topic,
          chainId: [payload.namespace, txChainId].join(':')
        });
        this.resolvePromise!(result);
        this.updateCurrentStatus(
          WALLETCONNECT_STATUS_MAP.SIBMITTED,
          account,
          result
        );
      } catch (e) {
        this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.REJECTED, account, e);
      }
    };

    this.onDisconnect = (error) => {
      if (!this.currentConnector) throw new Error('No connector avaliable');
      this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.FAILD, error);
      this.closeConnector(this.currentConnector, address, brandName);
    };

    await this.init(account.address, account.brandName, txChainId);

    return new Promise((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  async signPersonalMessage(
    address: string,
    message: string,
    { brandName = 'JADE', chainId }: { brandName: string; chainId: number }
  ) {
    const account = this.getAccount(address, brandName)!;

    if (!account) {
      throw new Error('Can not find this address');
    }

    this.onAfterConnect = async (payload) => {
      if (!this.currentConnector) throw new Error('No connector avaliable');
      if (payload) {
        if (payload.address.toLowerCase() !== address.toLowerCase()) {
          this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.FAILD, account, {
            message: 'Wrong address or chainId',
            code:
              payload.address.toLowerCase() === address.toLowerCase()
                ? 1000
                : 1001
          });
          return;
        }
      }
      try {
        this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.CONNECTED, account);
        await wait(() => {
          this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.WAITING, account);
        }, 1000);
        const chainId = payload.chainIds[0];
        const result = await this.currentConnector.connector.request({
          request: {
            method: 'personal_sign',
            params: [message, address]
          },
          topic: payload.session.topic,
          chainId: [payload.namespace, chainId].join(':')
        });
        this.resolvePromise!(result);
        this.updateCurrentStatus(
          WALLETCONNECT_STATUS_MAP.SIBMITTED,
          account,
          result
        );
      } catch (e) {
        console.log(e);
        this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.REJECTED, account, e);
      }
    };

    this.onDisconnect = (error) => {
      if (!this.currentConnector) throw new Error('No connector avaliable');

      this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.FAILD, error);
      this.closeConnector(this.currentConnector, account.address, brandName);
    };

    await this.init(account.address, account.brandName, chainId);

    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  private getAccount(address: string, brandName: string) {
    return this.accounts.find(
      (acct) =>
        acct.address.toLowerCase() === address.toLowerCase() &&
        acct.brandName === brandName
    );
  }

  async signTypedData(
    address: string,
    data,
    { brandName = 'JADE', chainId }: { brandName: string; chainId: number }
  ) {
    const account = this.getAccount(address, brandName);
    if (!account) {
      throw new Error('Can not find this address');
    }

    this.onAfterConnect = async (payload) => {
      const account = this.getAccount(address, brandName)!;
      if (!this.currentConnector) throw new Error('No connector avaliable');

      if (payload) {
        if (payload.address.toLowerCase() !== address.toLowerCase()) {
          this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.FAILD, account, {
            message: 'Wrong address or chainId',
            code:
              payload.address.toLowerCase() === address.toLowerCase()
                ? 1000
                : 1001
          });
          return;
        }
      }

      try {
        this.updateCurrentStatus(
          WALLETCONNECT_STATUS_MAP.CONNECTED,
          account,
          payload
        );

        await wait(() => {
          this.updateCurrentStatus(
            WALLETCONNECT_STATUS_MAP.WAITING,
            account,
            payload
          );
        }, 1000);

        const result = await this.currentConnector.connector.request({
          topic: payload.session.topic,
          chainId: [payload.namespace, chainId].join(':'),
          request: {
            method: 'eth_signTypedData',
            params: [
              address,
              typeof data === 'string' ? data : JSON.stringify(data)
            ]
          }
        });
        this.resolvePromise!(result);
        this.updateCurrentStatus(
          WALLETCONNECT_STATUS_MAP.SIBMITTED,
          account,
          result
        );
      } catch (e) {
        console.log(e);
        this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.REJECTED, account, e);
      }
    };

    this.onDisconnect = (error) => {
      if (!this.currentConnector) throw new Error('No connector avaliable');
      this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.FAILD, account, error);
      this.closeConnector(this.currentConnector, address, brandName);
    };

    await this.init(account.address, account.brandName, chainId);

    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  async getAccounts(): Promise<string[]> {
    return this.accounts.map((acct) => acct.address).slice();
  }

  async getAccountsWithBrand(): Promise<Account[]> {
    return this.accounts;
  }

  removeAccount(address: string, brandName: string): void {
    if (
      !this.accounts.find(
        (account) =>
          account.address.toLowerCase() === address.toLowerCase() &&
          account.brandName === brandName
      )
    ) {
      throw new Error(`Address ${address} not found in watch keyring`);
    }
    this.accounts = this.accounts.filter(
      (a) =>
        !(
          a.address.toLowerCase() === address.toLowerCase() &&
          a.brandName === brandName
        )
    );
  }

  updateCurrentStatus(
    status: number,
    account: Account | undefined,
    payload?: any
  ) {
    if (
      (status === WALLETCONNECT_STATUS_MAP.REJECTED ||
        status === WALLETCONNECT_STATUS_MAP.FAILD) &&
      (this.currentConnectStatus === WALLETCONNECT_STATUS_MAP.FAILD ||
        this.currentConnectStatus === WALLETCONNECT_STATUS_MAP.REJECTED ||
        this.currentConnectStatus === WALLETCONNECT_STATUS_MAP.SIBMITTED)
    ) {
      return;
    }
    this.currentConnectStatus = status;
    this.emit('statusChange', {
      status,
      account,
      payload
    });
  }

  _normalize(str) {
    return sanitizeHex(str);
  }
}

export default WalletConnectKeyring;
