// https://github.com/MetaMask/eth-simple-keyring#the-keyring-class-protocol
import { EventEmitter } from 'events';
import { isAddress } from 'web3-utils';
import { AccountData, addHexPrefix, bufferToHex } from 'ethereumjs-util';
import WalletConnect from '@debank/wc-client';
import { IClientMeta } from '@debank/wc-types';
import {
  TypedTransaction,
  JsonTx,
  Transaction,
  FeeMarketEIP1559Transaction
} from '@ethereumjs/tx';
import { isBrowser, wait } from './utils';

export const keyringType = 'WalletConnect';

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
  CHAIN_ERROR: 'CHAIN_ERROR',
  BRAND_NAME_ERROR: 'BRAND_NAME_ERROR'
};

export const DEFAULT_BRIDGE = 'https://derelay.rabby.io';

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
  clientMeta: IClientMeta;
  maxDuration?: number;
}

type ValueOf<T> = T[keyof T];

interface Connector {
  connector: WalletConnect;
  status: ValueOf<typeof WALLETCONNECT_STATUS_MAP>;
  brandName: string;
  chainId?: number;
  sessionStatus?: keyof typeof WALLETCONNECT_SESSION_STATUS_MAP;
}

class WalletConnectKeyring extends EventEmitter {
  static type = keyringType;
  type = keyringType;
  accounts: Account[] = [];
  accountToAdd: Account | null = null;
  resolvePromise: null | ((value: any) => void) = null;
  rejectPromise: null | ((value: any) => void) = null;
  onAfterConnect: null | ((err?: any, payload?: any) => void) = null;
  onDisconnect: null | ((err: any, payload: any) => void) = null;
  currentConnectStatus: number = WALLETCONNECT_STATUS_MAP.PENDING;
  maxDuration = 1800000; // 30 mins hour by default
  clientMeta: IClientMeta | null = null;
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

  initConnector = async (brandName: string, bridge?: string) => {
    let address: string | null = null;
    const connector = await this.createConnector(brandName, bridge);

    this.onAfterConnect = (error, payload) => {
      const [account] = payload.params[0].accounts;
      address = account;
      this.currentConnector = this.connectors[
        `${brandName}-${address!.toLowerCase()}`
      ] = {
        status: WALLETCONNECT_STATUS_MAP.CONNECTED,
        connector,
        chainId: payload.params[0].chainId,
        brandName,
        sessionStatus: WALLETCONNECT_SESSION_STATUS_MAP.CONNECTED
      } as Connector;
      this.updateCurrentStatus(
        WALLETCONNECT_STATUS_MAP.CONNECTED,
        null,
        account
      );
    };
    this.onDisconnect = (error, payload) => {
      if (address) {
        const connector =
          this.connectors[`${brandName}-${address.toLowerCase()}`];
        if (connector) {
          this.closeConnector(connector.connector, address, brandName);
        }
      }
      this.updateCurrentStatus(
        WALLETCONNECT_STATUS_MAP.FAILD,
        null,
        error || payload.params[0]
      );
    };

    return connector;
  };

  getConnectorInfoByPeerId(peerId: string) {
    const connectorKey = Object.keys(this.connectors).find(
      (key) => this.connectors[key].connector.peerId === peerId
    );
    if (!connectorKey) {
      return;
    }

    const [brandName, address] = connectorKey.split('-');
    const account = this.accounts.find(
      (acc) =>
        acc.address.toLowerCase() === address.toLowerCase() &&
        acc.brandName === brandName
    )!;

    return {
      brandName,
      address,
      connectorKey,
      account
    };
  }

  createConnector = async (brandName: string, bridge = DEFAULT_BRIDGE) => {
    if (isBrowser() && localStorage.getItem('walletconnect')) {
      // always clear walletconnect cache
      localStorage.removeItem('walletconnect');
    }
    const connector = new WalletConnect({
      bridge,
      clientMeta: this.clientMeta!
    });
    connector.on('connect', (error, payload) => {
      if (payload?.params[0]?.accounts) {
        const [account] = payload.params[0].accounts;
        const curr = (this.connectors[`${brandName}-${account.toLowerCase()}`] =
          {
            connector,
            status: connector.connected
              ? WALLETCONNECT_STATUS_MAP.CONNECTED
              : WALLETCONNECT_STATUS_MAP.PENDING,
            chainId: payload?.params[0]?.chainId,
            brandName,
            sessionStatus: 'CONNECTED'
          } as Connector);

        // check brandName
        if (!this.checkBrandName(brandName, payload)) {
          curr.sessionStatus = 'BRAND_NAME_ERROR';
          this.updateSessionStatus('BRAND_NAME_ERROR', {
            address: account,
            brandName
          });
          this.onAfterConnect?.(error, payload);
          return;
        }

        this.updateSessionStatus('CONNECTED', {
          address: account,
          brandName
        });

        setTimeout(() => {
          this.closeConnector(connector, account.address, brandName);
        }, this.maxDuration);
      }

      this.onAfterConnect?.(error, payload);
    });

    connector.on(
      'session_update',
      (
        error,
        payload: {
          event: string;
          params: {
            accounts: string[];
            chainId: number;
          }[];
        }
      ) => {
        const data = this.getConnectorInfoByPeerId(connector.peerId);
        if (!data) return;
        const { connectorKey, address: _address, brandName: _brandName } = data;
        const _chainId = this.connectors[connectorKey].chainId;
        const updateAddress = payload.params[0].accounts[0];
        const updateChain = payload.params[0].chainId;

        if (updateAddress.toLowerCase() !== _address.toLowerCase()) {
          this.connectors[connectorKey].sessionStatus = 'ACCOUNT_ERROR';
          this.updateSessionStatus('ACCOUNT_ERROR', {
            address: _address,
            brandName: _brandName
          });
        } else if (updateChain !== _chainId) {
          this.connectors[connectorKey].sessionStatus = 'CHAIN_ERROR';
          this.updateSessionStatus('CHAIN_ERROR', {
            address: _address,
            brandName: _brandName
          });
        } else {
          this.connectors[connectorKey].sessionStatus = 'CONNECTED';
          this.updateSessionStatus('CONNECTED', {
            address: _address,
            brandName: _brandName
          });
        }
      }
    );

    connector.on('session_received', (error, payload) => {
      this.updateSessionStatus('RECEIVED');
    });

    connector.on('session_resumed', (error, payload) => {
      const data = this.getConnectorInfoByPeerId(connector.peerId);
      if (!data) return;
      this.connectors[data.connectorKey].sessionStatus = 'CONNECTED';
      this.updateSessionStatus('CONNECTED', {
        address: data.address,
        brandName: data.brandName
      });
    });

    connector.on('session_suspended', (error, payload) => {
      const data = this.getConnectorInfoByPeerId(connector.peerId);
      if (!data) return;
      this.connectors[data.connectorKey].sessionStatus = 'DISCONNECTED';
      this.updateSessionStatus('DISCONNECTED', {
        address: data.address,
        brandName: data.brandName
      });
    });

    connector.on('disconnect', (error, payload) => {
      const data = this.getConnectorInfoByPeerId(connector.peerId);
      if (!data) return;
      this.connectors[data.connectorKey].sessionStatus = 'DISCONNECTED';
      this.updateSessionStatus('DISCONNECTED', {
        address: data.address,
        brandName: data.brandName
      });

      this.onDisconnect && this.onDisconnect(error, payload);
    });

    connector.on('transport_error', (error, payload) => {
      this.emit('transport_error', payload);
      // address is not necessary to close connection
      this.closeConnector(connector, '0x', brandName);
    });

    await connector.createSession();

    return connector;
  };

  closeConnector = async (
    connector: WalletConnect,
    address: string,
    brandName: string
  ) => {
    try {
      connector.transportClose();
      if (connector.connected) {
        await connector.killSession();
      }
    } catch (e) {
      // NOTHING
    }
    if (address) {
      delete this.connectors[`${brandName}-${address.toLowerCase()}`];
    }
  };

  init = async (address: string, brandName: string) => {
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

    let connector =
      this.connectors[`${brandName}-${account.address.toLowerCase()}`];
    if (!connector || !connector.connector.connected) {
      const newConnector = await this.createConnector(
        brandName,
        account.bridge
      );
      connector = {
        connector: newConnector,
        status: WALLETCONNECT_STATUS_MAP.PENDING,
        brandName
      };
    }

    // make sure the connector is the latest one before trigger onAfterConnect
    this.currentConnector = connector;

    if (connector.connector.connected) {
      connector.status = WALLETCONNECT_STATUS_MAP.CONNECTED;
      this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.CONNECTED, account);
      this.onAfterConnect?.(null, {
        params: [{ accounts: [account.address], chainId: connector.chainId }]
      });
    } else {
      connector.status = WALLETCONNECT_STATUS_MAP.PENDING;
    }

    this.emit('inited', connector.connector.uri);

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
      brandName: this.accountToAdd.brandName,
      bridge: this.accountToAdd.bridge || DEFAULT_BRIDGE
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
    this.onAfterConnect = async (error?, payload?) => {
      if (error) {
        this.updateCurrentStatus(
          WALLETCONNECT_STATUS_MAP.FAILD,
          account,
          error
        );
        return;
      }

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
        const { accounts, chainId } = payload.params[0];
        if (
          accounts[0].toLowerCase() !== address.toLowerCase() ||
          chainId !== txChainId
        ) {
          this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.FAILD, account, {
            message: 'Wrong address or chainId',
            code:
              accounts[0].toLowerCase() === address.toLowerCase() ? 1000 : 1001
          });
          return;
        }
        this.currentConnector.chainId = chainId;
      }
      try {
        const result = await this.currentConnector.connector.sendTransaction({
          data: this._normalize(txData.data),
          from: address,
          gas: this._normalize(txData.gasLimit),
          gasPrice: this._normalize(txData.gasPrice),
          nonce: this._normalize(txData.nonce),
          to: this._normalize(txData.to),
          value: this._normalize(txData.value) || '0x0' // prevent 0x
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

    this.onDisconnect = (error, payload) => {
      if (!this.currentConnector) throw new Error('No connector avaliable');
      this.updateCurrentStatus(
        WALLETCONNECT_STATUS_MAP.FAILD,
        error || payload.params[0]
      );
      this.closeConnector(this.currentConnector.connector, address, brandName);
    };

    await this.init(account.address, account.brandName);

    return new Promise((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  async signPersonalMessage(
    address: string,
    message: string,
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

    this.onAfterConnect = async (error?, payload?) => {
      if (error) {
        this.updateCurrentStatus(
          WALLETCONNECT_STATUS_MAP.FAILD,
          account,
          error
        );
        return;
      }
      if (!this.currentConnector) throw new Error('No connector avaliable');
      const { accounts } = payload.params[0];
      if (payload) {
        if (accounts[0].toLowerCase() !== address.toLowerCase()) {
          this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.FAILD, account, {
            message: 'Wrong address or chainId',
            code:
              accounts[0].toLowerCase() === address.toLowerCase() ? 1000 : 1001
          });
          return;
        }
      }
      try {
        this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.CONNECTED, payload);
        await wait(() => {
          this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.WAITING, payload);
        }, 1000);
        const result =
          await this.currentConnector.connector.signPersonalMessage([
            message,
            address
          ]);
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

    this.onDisconnect = (error, payload) => {
      if (!this.currentConnector) throw new Error('No connector avaliable');

      this.updateCurrentStatus(
        WALLETCONNECT_STATUS_MAP.FAILD,
        error || payload.params[0]
      );
      this.closeConnector(this.currentConnector.connector, address, brandName);
    };

    await this.init(account.address, account.brandName);

    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  async signTypedData(
    address: string,
    data,
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

    this.onAfterConnect = async (error, payload) => {
      if (error) {
        this.updateCurrentStatus(
          WALLETCONNECT_STATUS_MAP.FAILD,
          account,
          error
        );
        return;
      }

      if (!this.currentConnector) throw new Error('No connector avaliable');

      if (payload) {
        const { accounts } = payload.params[0];
        if (accounts[0].toLowerCase() !== address.toLowerCase()) {
          this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.FAILD, account, {
            message: 'Wrong address or chainId',
            code:
              accounts[0].toLowerCase() === address.toLowerCase() ? 1000 : 1001
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

        const result = await this.currentConnector.connector.signTypedData([
          address,
          typeof data === 'string' ? data : JSON.stringify(data)
        ]);
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

    this.onDisconnect = (error, payload) => {
      if (!this.currentConnector) throw new Error('No connector avaliable');
      this.updateCurrentStatus(
        WALLETCONNECT_STATUS_MAP.FAILD,
        account,
        error || payload.params[0]
      );
      this.closeConnector(this.currentConnector.connector, address, brandName);
    };

    await this.init(account.address, account.brandName);

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

  updateCurrentStatus(status: number, account: Account | null, payload?: any) {
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

  updateSessionStatus(
    status: keyof typeof WALLETCONNECT_SESSION_STATUS_MAP,
    opt?: {
      address: string;
      brandName: string;
    }
  ) {
    this.emit('sessionStatusChange', {
      status,
      ...opt
    });
  }

  _normalize(str) {
    return sanitizeHex(str);
  }

  checkBrandName(brandName, payload) {
    const name = payload.params[0].peerMeta.name;
    // just check if brandName is in name or name is in brandName
    const lowerName = name.toLowerCase();
    const lowerBrandName = brandName.toLowerCase();
    const WhiteList = {
      TP: ' TokenPocket',
      MetaMask: 'MetaMask'
    };
    if (
      WhiteList[brandName] === name ||
      lowerName.includes(lowerBrandName) ||
      lowerBrandName.includes(lowerName)
    ) {
      return true;
    }

    return false;
  }

  getSessionStatus(address: string, brandName: string) {
    const connector = this.connectors[`${brandName}-${address!.toLowerCase()}`];

    if (!connector) {
      return undefined;
    }

    return connector.sessionStatus;
  }
}

export default WalletConnectKeyring;
