import EventEmitter from 'events';
import { V1SDK } from './v1sdk';
import { V2SDK } from './v2sdk';
import { Account, COMMON_WALLETCONNECT, ConstructorOptions } from './type';
import { isAddress } from 'web3-utils';
import { addHexPrefix } from 'ethereumjs-util';
import { TypedTransaction } from '@ethereumjs/tx';
import { SDK } from './sdk';

export class WalletConnectKeyring extends EventEmitter {
  static type = 'WalletConnect';
  type = 'WalletConnect';

  v1SDK!: V1SDK;
  v2SDK!: V2SDK;
  _accounts: Account[] = [];
  accountToAdd: Account | null = null;
  v2Whitelist: string[] = [];

  get accounts() {
    return this._accounts;
  }

  set accounts(accounts: Account[]) {
    this._accounts = accounts;
    this.v1SDK.accounts = accounts;
    this.v2SDK.accounts = accounts;
  }

  constructor(opts: ConstructorOptions) {
    super();
    this.v2Whitelist = opts.v2Whitelist;
    this.v1SDK = new V1SDK(opts);
    this.v2SDK = new V2SDK(opts);
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
  }

  setAccountToAdd = (account: Account) => {
    this.accountToAdd = {
      ...account,
      address: account.address.toLowerCase()
    };
  };

  getSDK(brandName: string) {
    if (this.v2Whitelist.includes(brandName)) {
      return this.v2SDK;
    }
    return this.v1SDK;
  }

  async addAccounts(n: number) {
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
      const sdk = this.getSDK(this.accountToAdd.brandName);
      sdk.closeConnector(this.accountToAdd);
      sdk.updateSessionStatus('ADDRESS_DUPLICATE');
      throw new Error("The address you're are trying to import is duplicate");
    }

    this.accounts.push({
      address: prefixedAddress,
      brandName: this.accountToAdd.brandName,
      realBrandName: this.accountToAdd.realBrandName,
      realBrandUrl: this.accountToAdd.realBrandUrl
    });
    this.v1SDK.accounts = this.accounts;
    this.v2SDK.accounts = this.accounts;

    return [prefixedAddress];
  }

  async getAccounts(): Promise<string[]> {
    return this.accounts.map((acct) => acct.address).slice();
  }

  async getAccountsWithBrand(): Promise<Account[]> {
    return this.accounts;
  }

  private findAccount(account: Account) {
    return this.accounts?.find(
      (acc) =>
        acc.address.toLowerCase() === account.address.toLowerCase() &&
        acc.brandName === account.brandName
    );
  }

  removeAccount(address: string, brandName: string): void {
    if (
      !this.findAccount({
        address,
        brandName
      })
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

  getCommonWalletConnectInfo = (address: string) => {
    const account = this.accounts.find(
      (acct) =>
        acct.address.toLowerCase() === address.toLowerCase() &&
        COMMON_WALLETCONNECT.includes(acct.brandName)
    );

    if (!account) {
      return undefined;
    }

    return account;
  };

  resetConnect() {
    // clean onAfterSessionCreated
  }

  async init(address: string, brandName: string, chainId?: number) {
    const sdk = this.getSDK(brandName);
    return sdk.init(address, brandName, chainId);
  }

  async initConnector(brandName: string, chainId?: number, account?: Account) {
    const sdk = this.getSDK(brandName);
    return sdk.initConnector(brandName, chainId, account);
  }

  async scanAccount() {
    return this.v2SDK.scanAccount();
  }

  getConnectorStatus = (address: string, brandName: string) => {
    const sdk = this.getSDK(brandName);
    return sdk.getConnectorStatus(address, brandName);
  };
  getSessionStatus = (address: string, brandName: string) => {
    const sdk = this.getSDK(brandName);
    return sdk.getSessionStatus(address, brandName);
  };
  getSessionAccount = (address: string, brandName: string) => {
    const sdk = this.getSDK(brandName);
    return sdk.getSessionAccount(address, brandName);
  };
  getSessionNetworkDelay = (address: string, brandName: string) => {
    const sdk = this.getSDK(brandName);
    return sdk.getSessionNetworkDelay(address, brandName);
  };

  signTransaction = async (
    address,
    transaction: TypedTransaction,
    { brandName = 'JADE' }: { brandName: string }
  ) => {
    const sdk = this.getSDK(brandName);
    return sdk.signTransaction(address, transaction, { brandName });
  };

  signPersonalMessage = async (
    address: string,
    message: string,
    { brandName = 'JADE' }: { brandName: string }
  ) => {
    const sdk = this.getSDK(brandName);
    return sdk.signPersonalMessage(address, message, { brandName });
  };

  signTypedData = async (
    address: string,
    data,
    { brandName = 'JADE' }: { brandName: string }
  ) => {
    const sdk = this.getSDK(brandName);
    return sdk.signTypedData(address, data, { brandName });
  };

  closeConnector = (account: Account, silent?: boolean) => {
    const sdk = this.getSDK(account.brandName);
    return sdk.closeConnector(account, silent);
  };

  resend = (account: Account) => {
    const sdk = this.getSDK(account.brandName);
    return sdk.resend();
  };

  on(event: string, listener: (...args: any[]) => void): this {
    this.v1SDK.on(event, listener);
    this.v2SDK.on(event, listener);
    return this;
  }

  switchEthereumChain = (brandName: string, chainId: number) => {
    const sdk = this.getSDK(brandName);

    if (sdk.version === 2) return sdk.switchEthereumChain(chainId);
  };
}
