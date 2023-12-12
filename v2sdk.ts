import SignClient from '@walletconnect/sign-client';
import { SessionTypes } from '@walletconnect/types';
import { Cached } from './cached';
import {
  DEFAULT_EIP_155_EVENTS,
  checkBrandName,
  getBuildInBrandName,
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
import { wait } from './utils';
import { SDK } from './sdk';
import { toHex } from 'web3-utils';

export class V2SDK extends SDK {
  accounts: Account[] = [];
  client!: SignClient;
  cached = new Cached();
  currentTopic?: string;
  onAfterSessionCreated?: (topic: string) => void;
  onDisconnect?: (err: any, session: SessionTypes.Struct) => void;
  resolvePromise?: (value: any) => void;
  rejectPromise?: (value: any) => void;
  options!: ConstructorOptions;

  version = 2;

  constructor(opts: ConstructorOptions) {
    super();
    this.options = opts;
    this.accounts = opts.accounts || [];
    this.initSDK();
  }

  async initSDK() {
    this.client = await SignClient.init({
      projectId: this.options.projectId,
      metadata: this.options.clientMeta
    });

    // clear inactive session
    const activeSessions = this.client.session.keys;
    this.cached.getAllTopics().forEach((topic) => {
      if (!activeSessions.includes(topic)) {
        this._closeConnector({ topic });
      }
    });

    this.client.on('session_delete', (session) => {
      console.log('session_delete', session);
      this._closeConnector({ topic: session.topic });
    });

    this.client.on('session_update', console.log);

    this.client.on('session_event', ({ topic, params }) => {
      console.log('session_event', topic, params);

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
        const payloadAddress = params.event.data[0].split(':')[2];
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

    this.client.on('session_ping', console.log);

    this.client.on('session_expire', (session) => {
      console.log('session_expire', session);
      this._closeConnector(session);
    });
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
    this.onAfterSessionCreated = async (topic) => {
      const payload = this.cached.getTopic(topic);
      if (payload) {
        if (
          payload.address.toLowerCase() !== address.toLowerCase() ||
          payload.chainId !== txChainId
        ) {
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

    this.onAfterSessionCreated = async (topic) => {
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

    this.onAfterSessionCreated = async (topic) => {
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
  async init(address: string, brandName: string, chainId?: number) {
    const account = this.findAccount({ address, brandName });

    if (!account) {
      throw new Error('Can not find this address');
    }

    const topic = this.findTopic(account);
    if (topic) {
      this.updateConnectionStatus(WALLETCONNECT_STATUS_MAP.CONNECTED, account);
      this.onAfterSessionCreated?.(topic);
      // switch connection status?
      return;
    }

    const { uri } = await this.initConnector(brandName, chainId, account);

    return { uri };
  }

  // initialize the connector
  async initConnector(brandName: string, chainId?: number, account?: Account) {
    // wait 1min
    let loopCount = 0;
    while (!this.client && loopCount < 60) {
      loopCount++;
      await wait(() => this.client, 1000);
    }

    const uri = await this.createSession(brandName, chainId, account);
    this.emit('inited', uri);

    return { uri };
  }

  async scanAccount() {
    const { uri, approval } = await this.client.connect({
      requiredNamespaces: getRequiredNamespaces(['eip155:1'])
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

  resend = () => {
    this.onAfterSessionCreated?.(this.currentTopic!);
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
    chainId = 1,
    curAccount?: Account
  ) {
    const { uri, approval } = await this.client.connect({
      requiredNamespaces: getRequiredNamespaces([`eip155:${chainId}`]),
      optionalNamespaces: {
        [`eip155:${chainId}`]: {
          methods: ['wallet_switchEthereumChain'],
          events: []
        }
      }
    });

    approval().then((session) => {
      const metaData = session.peer.metadata;
      const account = parseNamespaces(session.namespaces)[0];
      const data = {
        address: account.address,
        brandName: session.peer.metadata.name,
        chainId: account.chainId,
        namespace: account.namespace
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
}
