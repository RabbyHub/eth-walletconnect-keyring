// https://github.com/MetaMask/eth-simple-keyring#the-keyring-class-protocol
import WalletConnect from '@rabby-wallet/wc-client';
import { IClientMeta } from '@rabby-wallet/wc-types';
import {
  TypedTransaction,
  JsonTx,
  Transaction,
  FeeMarketEIP1559Transaction
} from '@ethereumjs/tx';
import { isBrowser, wait } from './utils';
import { SDK } from './sdk';
import { sanitizeHex } from './helper';
import {
  WALLETCONNECT_STATUS_MAP,
  WALLETCONNECT_SESSION_STATUS_MAP,
  COMMON_WALLETCONNECT,
  buildInWallets,
  BuildInWalletPeerName,
  IGNORE_CHECK_WALLET,
  Account,
  ConstructorOptions
} from './type';
import KeyValueStorage from '@walletconnect/keyvaluestorage';
const storage = new KeyValueStorage({});

export const DEFAULT_BRIDGE = 'https://derelay.rabby.io';

type ValueOf<T> = T[keyof T];

type ConnectPayload = {
  params: {
    accounts: string[];
    peerMeta: IClientMeta;
    chainId: number;
  }[];
};

interface Connector {
  connector: WalletConnect;
  status: ValueOf<typeof WALLETCONNECT_STATUS_MAP>;
  networkDelay: number;
  brandName: string;
  chainId?: number;
  sessionStatus?: keyof typeof WALLETCONNECT_SESSION_STATUS_MAP;
  preSessionStatus?: keyof typeof WALLETCONNECT_SESSION_STATUS_MAP;
  peerMeta: IClientMeta;
  silent?: boolean;
}

export class V1SDK extends SDK {
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
  currentConnectParams: any = null;

  version = 1;

  constructor(opts: ConstructorOptions) {
    super();
    this.accounts = opts.accounts || [];
  }

  initConnector = async (brandName: string) => {
    let address: string | null = null;
    const connector = await this.createConnector(brandName);

    this.onAfterConnect = (error, payload: ConnectPayload) => {
      const [account] = payload.params[0].accounts;
      address = account;
      const lowerAddress = address!.toLowerCase();
      const conn = this.connectors[`${brandName}-${lowerAddress}`];

      this.currentConnector = this.connectors[`${brandName}-${lowerAddress}`] =
        {
          ...conn,
          status: WALLETCONNECT_STATUS_MAP.CONNECTED,
          chainId: payload.params[0].chainId,
          brandName,
          sessionStatus: 'CONNECTED'
        } as Connector;

      this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.CONNECTED, null, {
        ...payload.params[0],
        account
      });
    };
    this.onDisconnect = (error, payload) => {
      if (address) {
        const connector =
          this.connectors[`${brandName}-${address.toLowerCase()}`];
        if (connector) {
          this._closeConnector(connector.connector, address, brandName);
        }
      }
      this.updateCurrentStatus(
        WALLETCONNECT_STATUS_MAP.FAILD,
        null,
        error || payload.params[0]
      );
    };

    this.emit('inited', connector.uri);

    return connector;
  };

  getConnectorInfoByClientId(clientId: string) {
    const connectorKey = Object.keys(this.connectors).find(
      (key) => this.connectors[key]?.connector?.clientId === clientId
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

  getBuildInBrandName(
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

  createConnector = async (brandName: string, curAccount?: Account) => {
    if (isBrowser()) {
      // always clear walletconnect cache
      storage.removeItem('walletconnect');
    }
    const connector = new WalletConnect({
      bridge: DEFAULT_BRIDGE,
      clientMeta: this.clientMeta!
    });
    console.log('create connect');
    connector.on('connect', (error, payload) => {
      console.log('error', error);
      console.log('payload', payload);
      if (payload?.params[0]?.accounts) {
        const [account] = payload.params[0].accounts;
        const buildInBrand = this.getBuildInBrandName(
          brandName,
          payload.params[0].peerMeta?.name,
          // if is old account and is desktop, should ignore check
          !!curAccount
        );
        const conn = (this.connectors[
          `${buildInBrand}-${account.toLowerCase()}`
        ] = {
          connector,
          status: connector.connected
            ? WALLETCONNECT_STATUS_MAP.CONNECTED
            : WALLETCONNECT_STATUS_MAP.PENDING,
          chainId: payload?.params[0]?.chainId,
          brandName: buildInBrand,
          sessionStatus: 'CONNECTED',
          peerMeta: payload?.params[0]?.peerMeta
        } as Connector);

        setTimeout(() => {
          this._closeConnector(connector, account, buildInBrand);
        }, this.maxDuration);

        // check brandName
        if (
          !COMMON_WALLETCONNECT.includes(buildInBrand) &&
          !this._checkBrandName(buildInBrand, payload)
        ) {
          conn.sessionStatus = 'BRAND_NAME_ERROR';
          this.updateSessionStatus('BRAND_NAME_ERROR', {
            address: curAccount?.address || account,
            brandName: curAccount?.brandName || buildInBrand
          });
          this._close(account, buildInBrand, true);
          return;
        }

        if (curAccount) {
          if (
            account.toLowerCase() !== curAccount?.address.toLowerCase() ||
            buildInBrand !== curAccount?.brandName
          ) {
            conn.sessionStatus = 'ACCOUNT_ERROR';
            this.updateSessionStatus('ACCOUNT_ERROR', curAccount);
            this._close(account, buildInBrand, true);
            return;
          }
        }

        this.updateSessionStatus('CONNECTED', {
          address: account,
          brandName: buildInBrand,
          realBrandName: conn.peerMeta?.name
        });
        this.emit('sessionAccountChange', {
          address: account,
          brandName: buildInBrand,
          chainId: conn.chainId
        });

        this.currentConnector = conn;

        this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.CONNECTED, null, {
          ...payload.params[0],
          account
        });
      }

      this.currentConnectParams = [error, payload];
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
        const data = this.getConnectorInfoByClientId(connector.clientId);
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
        } else {
          this.connectors[connectorKey].sessionStatus = 'CONNECTED';
          this.updateSessionStatus('CONNECTED', {
            address: _address,
            brandName: _brandName
          });
        }

        this.emit('sessionAccountChange', {
          address: _address,
          brandName: _brandName,
          chainId: updateChain
        });
        this.connectors[connectorKey].chainId = updateChain;
      }
    );

    connector.on('ack', (error, payload) => {
      const data = this.getConnectorInfoByClientId(connector.clientId);
      if (data) {
        // todo
        const conn = this.connectors[data.connectorKey];
        if (conn.status === WALLETCONNECT_STATUS_MAP.CONNECTED) {
          this.updateCurrentStatus(
            WALLETCONNECT_STATUS_MAP.WAITING,
            data.account
          );
        }
        return;
      }

      this.updateSessionStatus('RECEIVED');
    });

    connector.on('session_resumed', (error, payload) => {
      const data = this.getConnectorInfoByClientId(connector.clientId);
      if (!data) return;
      const conn = this.connectors[data.connectorKey];
      conn.sessionStatus = conn.preSessionStatus ?? 'CONNECTED';
      this.updateSessionStatus(conn.sessionStatus, {
        address: data.address,
        brandName: data.brandName
      });
    });

    connector.on('session_suspended', (error, payload) => {
      const data = this.getConnectorInfoByClientId(connector.clientId);
      if (!data) {
        this.updateSessionStatus('REJECTED');
        return;
      }
      const conn = this.connectors[data.connectorKey];
      if (conn.sessionStatus !== 'DISCONNECTED') {
        conn.preSessionStatus = conn.sessionStatus;
      }
      conn.sessionStatus = 'DISCONNECTED';
      this.updateSessionStatus('DISCONNECTED', {
        address: data.address,
        brandName: data.brandName
      });
    });

    connector.on('disconnect', (error, payload) => {
      if (payload.params[0]?.message.toLowerCase().includes('rejected')) {
        this.updateSessionStatus('REJECTED');
        return;
      }
      const data = this.getConnectorInfoByClientId(connector.clientId);
      if (!data) return;
      const { silent } = this.connectors[data.connectorKey];
      if (!silent) {
        this.connectors[data.connectorKey].sessionStatus = 'DISCONNECTED';
        this.updateSessionStatus('DISCONNECTED', {
          address: data.address,
          brandName: data.brandName
        });
      }
      this.onDisconnect && this.onDisconnect(error, payload);
    });

    connector.on('transport_error', (error, payload) => {
      this.emit('transport_error', payload);
      const data = this.getConnectorInfoByClientId(connector.clientId);

      if (data) {
        this._closeConnector(connector, data.address, data.brandName);
      }
    });

    connector.on('transport_pong', (error, { params: [{ delay }] }) => {
      const data = this.getConnectorInfoByClientId(connector.clientId);
      if (!data) return;
      this.connectors[data.connectorKey].networkDelay = delay;
      this.emit('sessionNetworkDelay', {
        address: data.address,
        brandName: data.brandName,
        delay
      });
    });

    await connector.createSession();

    return connector;
  };

  closeConnector: SDK['closeConnector'] = async (account: Account, silent) => {
    const { brandName, address } = account;
    const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
    this._closeConnector(connector.connector, address, brandName, silent);
  };

  private _closeConnector = async (
    connector: WalletConnect,
    address: string,
    brandName: string,
    // don't broadcast close messages
    silent?: boolean
  ) => {
    try {
      this.connectors[`${brandName}-${address.toLowerCase()}`].silent = silent;
      connector?.transportClose();
      if (connector?.connected) {
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
    if (isBrowser()) {
      // always clear walletconnect cache
      localStorage.removeItem('walletconnect');
    }

    const account = this.accounts.find(
      (acc) =>
        acc.address.toLowerCase() === address.toLowerCase() &&
        acc.brandName === brandName
    );
    let connector;
    if (account) {
      const lowerAddress = account?.address.toLowerCase();
      connector = this.connectors[`${brandName}-${lowerAddress}`];
      if (!connector?.connector?.connected) {
        const newConnector = await this.createConnector(brandName, account);
        connector = {
          ...this.connectors[`${brandName}-${lowerAddress}`],
          connector: newConnector,
          status: WALLETCONNECT_STATUS_MAP.PENDING
        };
      }
    }

    // make sure the connector is the latest one before trigger onAfterConnect
    this.currentConnector = connector;

    if (connector?.connector?.connected) {
      const account = this.accounts.find(
        (acc) =>
          acc.address.toLowerCase() === address.toLowerCase() &&
          acc.brandName === brandName
      )!;
      connector.status = WALLETCONNECT_STATUS_MAP.CONNECTED;
      this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.CONNECTED, account);
      this.onAfterConnect?.(null, {
        params: [{ accounts: [account.address], chainId: connector.chainId }]
      });
    } else if (connector) {
      connector.status = WALLETCONNECT_STATUS_MAP.PENDING;
    }

    if (connector?.connector?.uri) {
      this.emit('inited', connector.connector.uri);
    }

    return connector;
  };

  getConnectorStatus = (address: string, brandName: string) => {
    const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
    if (connector) {
      return connector.status;
    }
    return null;
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
      this._closeConnector(this.currentConnector.connector, address, brandName);
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
      this._closeConnector(this.currentConnector.connector, address, brandName);
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
      this._closeConnector(this.currentConnector.connector, address, brandName);
    };

    await this.init(account.address, account.brandName);

    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  _close(address: string, brandName: string, silent?: boolean) {
    const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
    if (connector) {
      this._closeConnector(connector.connector, address, brandName, silent);
    }
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

    const connector =
      this.connectors[
        `${account?.brandName}-${account?.address?.toLowerCase()}`
      ];
    if (connector) {
      connector.status = status;
    }

    this.emit('statusChange', {
      status,
      account: account || {
        address: payload?.account
      },
      payload: {
        ...payload,
        peer: {
          metadata: payload?.peerMeta
        }
      }
    });
  }

  updateSessionStatus: SDK['updateSessionStatus'] = (status, opt) => {
    this.emit('sessionStatusChange', {
      status,
      ...opt
    });
  };

  _normalize(str) {
    return sanitizeHex(str);
  }

  _checkBrandName(brandName, payload) {
    const name = payload.params[0].peerMeta?.name;
    // just check if brandName is in name or name is in brandName
    let lowerName = name?.toLowerCase() as string;
    if (!lowerName) {
      this.emit(
        'error',
        new Error(
          '[WalletConnect] No peerMeta name ' +
            JSON.stringify(payload.params[0].peerMeta)
        )
      );
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

  getSessionStatus = (address: string, brandName: string) => {
    const connector = this.connectors[`${brandName}-${address!.toLowerCase()}`];

    if (!connector) {
      return undefined;
    }

    return connector.sessionStatus;
  };

  getSessionAccount = (address: string, brandName: string) => {
    const connector = this.connectors[`${brandName}-${address!.toLowerCase()}`];

    if (!connector) {
      return undefined;
    }

    return {
      address,
      brandName: connector.brandName,
      chainId: connector.chainId
    };
  };

  getSessionNetworkDelay = (address: string, brandName: string) => {
    const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
    if (connector) {
      return connector.networkDelay;
    }
    return null;
  };

  resend = () => {
    this.onAfterConnect?.(...this.currentConnectParams);
  };

  switchEthereumChain = () => {
    throw new Error('Method not implemented.');
  };
}
