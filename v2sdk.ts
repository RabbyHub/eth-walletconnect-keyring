import SignClient from '@walletconnect/sign-client';
import { EngineTypes, SessionTypes } from '@walletconnect/types';
import { Cached } from './cached';
import {
  DEFAULT_EIP_155_EVENTS,
  checkBrandName,
  getBuildInBrandName,
  getNamespaces,
  getRequiredNamespaces,
  parseNamespaces,
  sanitizeHex
} from './helper';
import {
  Account,
  COMMON_WALLETCONNECT,
  ConstructorOptions,
  WALLETCONNECT_SESSION_STATUS_MAP,
  WALLETCONNECT_STATUS_MAP
} from './type';
import { getSdkError } from '@walletconnect/utils';
import {
  TypedTransaction,
  JsonTx,
  Transaction,
  FeeMarketEIP1559Transaction
} from '@ethereumjs/tx';
import { bufferToHex, convertToBigint, getChainId, wait } from './utils';
import { SDK } from './sdk';
import { toHex } from 'web3-utils';

export class V2SDK extends SDK {
  accounts: Account[] = [];
  client!: SignClient;
  cached = new Cached();
  currentTopic?: string;
  onAfterSessionCreated?: null | ((topic: string) => void);
  onDisconnect?: (err: any, session: SessionTypes.Struct) => void;
  resolvePromise?: (value: any) => void;
  rejectPromise?: (value: any) => void;
  options!: ConstructorOptions;

  version = 2;

  loading = false;

  constructor(opts: ConstructorOptions) {
    super();
    this.options = opts;
    this.accounts = opts.accounts || [];
    this.initSDK();
  }

  async initSDK() {
    this.loading = true;
    this.client = undefined as any;
    this.client = await SignClient.init({
      projectId: this.options.projectId,
      metadata: this.options.clientMeta
    }).finally(() => {
      this.loading = false;
    });

    // clear inactive session
    const activeSessions = this.client.session.keys;
    this.cached.getAllTopics().forEach((topic) => {
      if (!activeSessions.includes(topic)) {
        this._closeConnector({ topic });
      }
    });

    this.client.on('session_delete', (session) => {
      this._closeConnector({ topic: session.topic });
    });

    this.client.on('session_event', ({ topic, params }) => {
      const data = this.cached.getTopic(topic);
      if (!data) return;

      if (params.event.name === DEFAULT_EIP_155_EVENTS.ETH_CHAIN_CHANGED) {
        this.emit('sessionAccountChange', {
          address: data.address,
          brandName: data.brandName,
          chainId: params.event.data
        });
        this.cached.updateTopic(topic, {
          chainId: params.event.data
        });
      }
      if (params.event.name === DEFAULT_EIP_155_EVENTS.ETH_ACCOUNTS_CHANGED) {
        const accountStr = params.event.data[0];
        const payloadAddress = accountStr.includes(':')
          ? accountStr.split(':')[2]
          : accountStr;

        if (payloadAddress.toLowerCase() !== data?.address.toLowerCase()) {
          this.updateSessionStatus('ACCOUNT_ERROR', {
            address: data.address,
            brandName: data.brandName
          });
        } else {
          this.updateSessionStatus('CONNECTED', {
            address: data.address,
            brandName: data.brandName
          });
        }
      }
    });

    this.client.on('session_expire', (session) => {
      this._closeConnector(session);
    });

    const listenerJwtError = () => {
      this.client?.core.relayer.provider.once('error', async (e) => {
        // error code 3000 meaning the jwt token is expired, need to re-init the client
        // only appear in connect method
        if (e.message.includes('3000')) {
          await this.initSDK();
          this.onAfterSessionCreated?.('');
          console.log('jwt token is expired');
        } else {
          listenerJwtError();
        }
      });
    };

    listenerJwtError();
  }

  async signTransaction(
    address,
    transaction: TypedTransaction,
    { brandName = 'JADE' }: { brandName: string }
  ) {
    const account = this.findAccount({
      address,
      brandName
    });
    if (!account) {
      throw new Error('Can not find this address');
    }

    const txData: JsonTx = {
      to: transaction.to!.toString(),
      value: convertToBigint(transaction.value),
      data: bufferToHex(transaction.data),
      nonce: convertToBigint(transaction.nonce),
      gasLimit: convertToBigint(transaction.gasLimit),
      gasPrice:
        typeof (transaction as Transaction).gasPrice !== 'undefined'
          ? convertToBigint((transaction as Transaction).gasPrice)
          : convertToBigint(
              (transaction as FeeMarketEIP1559Transaction).maxFeePerGas
            )
    };
    const txChainId = getChainId(transaction.common);
    this._resend = this.onAfterSessionCreated = async (topic) => {
      const payload = this.cached.getTopic(topic);
      if (payload) {
        if (payload.address.toLowerCase() !== address.toLowerCase()) {
          this.updateConnectionStatus(WALLETCONNECT_STATUS_MAP.FAILD, account, {
            message: 'Wrong address or chainId',
            code: address.toLowerCase() === address.toLowerCase() ? 1000 : 1001
          });
          return;
        }
      }
      try {
        const result = await this.client.request({
          request: {
            method: 'eth_sendTransaction',
            params: [
              {
                data: sanitizeHex(txData.data),
                from: address,
                gas: sanitizeHex(txData.gasLimit),
                gasPrice: sanitizeHex(txData.gasPrice),
                nonce: sanitizeHex(txData.nonce),
                to: sanitizeHex(txData.to),
                value: sanitizeHex(txData.value) || '0x0' // prevent 0x
              }
            ]
          },
          topic,
          chainId: [payload!.namespace, txChainId].join(':')
        });
        this.resolvePromise!(result);
        this.updateConnectionStatus(
          WALLETCONNECT_STATUS_MAP.SIBMITTED,
          account,
          result
        );
      } catch (e) {
        console.error(e);
        this.updateConnectionStatus(
          WALLETCONNECT_STATUS_MAP.REJECTED,
          account,
          e
        );
      }
    };

    this.onDisconnect = (error, payload) => {
      this.updateConnectionStatus(WALLETCONNECT_STATUS_MAP.FAILD, error);
      this._closeConnector(payload);
    };

    await this.init(account.address, account.brandName, txChainId);

    return new Promise((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  async switchEthereumChain(chainId: number) {
    const payload = this.cached.getTopic(this.currentTopic!)!;

    return this.client.request({
      request: {
        method: 'wallet_switchEthereumChain',
        params: [
          {
            chainId: toHex(chainId)
          }
        ]
      },
      topic: this.currentTopic!,
      chainId: [payload.namespace, payload.chainId].join(':')
    });
  }

  async signPersonalMessage(
    address: string,
    message: string,
    { brandName = 'JADE' }: { brandName: string }
  ) {
    const account = this.findAccount({
      address,
      brandName
    });
    if (!account) {
      throw new Error('Can not find this address');
    }

    this._resend = this.onAfterSessionCreated = async (topic) => {
      const payload = this.cached.getTopic(topic)!;
      if (payload) {
        if (payload.address.toLowerCase() !== address.toLowerCase()) {
          this.updateConnectionStatus(WALLETCONNECT_STATUS_MAP.FAILD, account, {
            message: 'Wrong address or chainId',
            code: address.toLowerCase() === address.toLowerCase() ? 1000 : 1001
          });
          return;
        }
      }
      try {
        const result = await this.client.request({
          request: {
            method: 'personal_sign',
            params: [message, address]
          },
          topic,
          chainId: [payload.namespace, payload.chainId].join(':')
        });
        this.resolvePromise!(result);
        this.updateConnectionStatus(
          WALLETCONNECT_STATUS_MAP.SIBMITTED,
          account,
          result
        );
      } catch (e) {
        console.error(e);
        this.updateConnectionStatus(
          WALLETCONNECT_STATUS_MAP.REJECTED,
          account,
          e
        );
      }
    };

    this.onDisconnect = (error, payload) => {
      this.updateConnectionStatus(WALLETCONNECT_STATUS_MAP.FAILD, error);
      this._closeConnector(payload);
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
    const account = this.findAccount({
      address,
      brandName
    });
    if (!account) {
      throw new Error('Can not find this address');
    }

    this._resend = this.onAfterSessionCreated = async (topic) => {
      const payload = this.cached.getTopic(topic)!;
      if (payload) {
        if (payload.address.toLowerCase() !== address.toLowerCase()) {
          this.updateConnectionStatus(WALLETCONNECT_STATUS_MAP.FAILD, account, {
            message: 'Wrong address or chainId',
            code: address.toLowerCase() === address.toLowerCase() ? 1000 : 1001
          });
          return;
        }
      }

      try {
        this.updateConnectionStatus(
          WALLETCONNECT_STATUS_MAP.CONNECTED,
          account,
          payload
        );

        const result = await this.client.request({
          topic,
          chainId: [payload.namespace, payload.chainId].join(':'),
          request: {
            method: 'eth_signTypedData',
            params: [
              address,
              typeof data === 'string' ? data : JSON.stringify(data)
            ]
          }
        });
        this.resolvePromise!(result);
        this.updateConnectionStatus(
          WALLETCONNECT_STATUS_MAP.SIBMITTED,
          account,
          result
        );
      } catch (e) {
        console.error(e);
        this.updateConnectionStatus(
          WALLETCONNECT_STATUS_MAP.REJECTED,
          account,
          e
        );
      }
    };

    this.onDisconnect = (error, payload) => {
      this.updateConnectionStatus(
        WALLETCONNECT_STATUS_MAP.FAILD,
        account,
        error
      );
      this._closeConnector(payload);
    };

    await this.init(account.address, account.brandName);

    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  // initialize or find the session
  async init(address: string, brandName: string, chainIds?: number[] | number) {
    const account = this.findAccount({ address, brandName });

    if (!account) {
      throw new Error('Can not find this address');
    }

    const topic = this.findTopic(account);
    if (topic) {
      this.updateConnectionStatus(WALLETCONNECT_STATUS_MAP.CONNECTED, account);
      this.onAfterSessionCreated?.(topic);
      this.onAfterSessionCreated = null;
      // switch connection status?
      return;
    }

    const chainIdsArr = !chainIds
      ? [1]
      : Array.isArray(chainIds)
      ? chainIds
      : [chainIds];
    const { uri } = await this.initConnector(brandName, chainIdsArr, account);

    return { uri };
  }

  async waitInitClient() {
    // wait 1min
    let loopCount = 0;
    while (!this.client && loopCount < 60) {
      if (!this.loading) {
        try {
          await this.initSDK();
        } catch (e) {
          console.error(e);
        }
      }
      loopCount++;
      await wait(() => this.client, 1000);
    }
  }

  // initialize the connector
  async initConnector(
    brandName: string,
    chainIds?: number[],
    account?: Account
  ) {
    const run = (this.onAfterSessionCreated = async () => {
      await this.waitInitClient();

      const uri = await this.createSession(brandName, chainIds, account);
      this.emit('inited', uri);

      return { uri };
    });

    return run();
  }

  async scanAccount() {
    const { uri, approval } = await this.client.connect({
      optionalNamespaces: getNamespaces([1])
    });

    approval().then((session) => {
      const account = parseNamespaces(session.namespaces)[0];

      this.emit('scanAccount', {
        address: account.address
      });

      this._closeConnector(session, true);
    });

    return uri;
  }

  getConnectorStatus(address: string, brandName: string) {
    const topic = this.findTopic({
      address,
      brandName
    });

    if (topic) {
      const data = this.cached.getTopic(topic);
      return data?.status;
    }
  }

  getSessionStatus = (address: string, brandName: string) => {
    const topic = this.findTopic({
      address,
      brandName
    });

    if (topic) {
      const data = this.cached.getTopic(topic);
      return data?.sessionStatus;
    }
  };

  getSessionAccount = (address: string, brandName: string) => {
    const topic = this.findTopic({
      address,
      brandName
    });

    if (topic) {
      return this.cached.getTopic(topic);
    }
  };

  getSessionNetworkDelay = (address: string, brandName: string) => {
    const topic = this.findTopic({
      address,
      brandName
    });

    if (topic) {
      const data = this.cached.getTopic(topic);
      return data?.networkDelay;
    }
  };

  private _resend?: (topic: string) => void;

  resend = () => {
    this._resend?.(this.currentTopic!);
  };

  private findTopic(account?: Account) {
    if (!account) return;

    const key = {
      address: account.address,
      brandName: account.brandName
    };
    const topic = this.cached.findTopic(key);
    this.currentTopic = topic;

    if (topic) {
      return topic;
    }
  }

  private async createSession(
    brandName: string,
    chainIds: number[] = [1],
    curAccount?: Account
  ) {
    const params: EngineTypes.ConnectParams = {
      requiredNamespaces: getRequiredNamespaces(),
      optionalNamespaces: getNamespaces(chainIds)
    };

    const { uri, approval } = await this.client.connect(params);

    approval().then((session) => {
      const metaData = session.peer.metadata;
      const account = parseNamespaces(session.namespaces)[0];
      const data = {
        address: account.address,
        brandName: session.peer.metadata.name,
        chainId: account.chainId,
        namespace: account.namespace,
        deepLink: uri!
      };

      // check brandName
      const buildInBrand = getBuildInBrandName(
        brandName,
        metaData.name,
        !!curAccount
      );
      if (
        !COMMON_WALLETCONNECT.includes(buildInBrand) &&
        !checkBrandName(buildInBrand, metaData.name)
      ) {
        this.updateSessionStatus('BRAND_NAME_ERROR', {
          address: curAccount?.address || data.address,
          brandName: curAccount?.brandName || buildInBrand
        });
        this._closeConnector(session, true);
        return;
      }

      // check account
      if (curAccount) {
        if (
          account.address.toLowerCase() !== curAccount?.address.toLowerCase() ||
          buildInBrand !== curAccount?.brandName
        ) {
          this.updateSessionStatus('ACCOUNT_ERROR', curAccount);
          this._closeConnector(session, true);
          return;
        }
      }

      data.brandName = buildInBrand;
      this.cached.setTopic(session.topic, data);
      this.currentTopic = session.topic;
      this.updateSessionStatus('CONNECTED', {
        address: account.address,
        brandName: buildInBrand,
        realBrandName: metaData.name
      });
      this.emit('sessionAccountChange', {
        address: account.address,
        brandName: buildInBrand,
        chainId: account.chainId
      });
      this.updateConnectionStatus(
        WALLETCONNECT_STATUS_MAP.CONNECTED,
        {
          address: account.address,
          brandName: buildInBrand
        },
        session
      );
    });

    return uri;
  }

  closeConnector: SDK['closeConnector'] = async (account, silent) => {
    const topic = this.findTopic(account);
    if (!topic) return;
    this._closeConnector({ topic }, silent);
  };

  async _closeConnector({ topic }: { topic: string }, silent?: boolean) {
    try {
      await this.client.disconnect({
        topic,
        reason: getSdkError('USER_DISCONNECTED')
      });
    } catch (e) {}

    const payload = this.cached.getTopic(topic);
    this.cached.deleteTopic(topic);

    if (!silent) {
      this.emit('sessionStatusChange', {
        ...payload,
        status: WALLETCONNECT_SESSION_STATUS_MAP.DISCONNECTED
      });
    }
  }

  private findAccount(account: Account) {
    return this.accounts?.find(
      (acc) =>
        acc.address.toLowerCase() === account.address.toLowerCase() &&
        acc.brandName === account.brandName
    );
  }

  private updateConnectionStatus(
    status: number,
    account?: Account,
    payload?: any
  ) {
    this.emit('statusChange', {
      status,
      account,
      payload
    });

    const topic = this.findTopic(account);
    this.cached.updateTopic(topic!, {
      status
    });
  }

  updateSessionStatus: SDK['updateSessionStatus'] = (status, opt) => {
    this.emit('sessionStatusChange', {
      status,
      ...opt
    });

    const topic = this.findTopic(opt!);
    if (topic) {
      this.cached.updateTopic(topic, {
        sessionStatus: status
      });
    }
  };

  async checkClientIsCreate({
    address,
    brandName
  }: {
    address: string;
    brandName: string;
  }) {
    const topic = this.findTopic({
      address,
      brandName
    });

    if (!topic) {
      this.updateSessionStatus('DISCONNECTED', {
        address,
        brandName
      });
      return WALLETCONNECT_SESSION_STATUS_MAP.DISCONNECTED;
    }
    await this.waitInitClient();

    return this.getSessionStatus(address, brandName);
  }
}
