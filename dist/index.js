"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletConnectKeyring = void 0;
const events_1 = __importDefault(require("events"));
const v1sdk_1 = require("./v1sdk");
const v2sdk_1 = require("./v2sdk");
const type_1 = require("./type");
const web3_utils_1 = require("web3-utils");
const ethereumjs_util_1 = require("ethereumjs-util");
class WalletConnectKeyring extends events_1.default {
    constructor(opts) {
        super();
        this.type = 'WalletConnect';
        this._accounts = [];
        this.accountToAdd = null;
        this.v2Whitelist = [];
        this.setAccountToAdd = (account) => {
            this.accountToAdd = Object.assign(Object.assign({}, account), { address: account.address.toLowerCase() });
        };
        this.getCommonWalletConnectInfo = (address) => {
            const account = this.accounts.find((acct) => acct.address.toLowerCase() === address.toLowerCase() &&
                type_1.COMMON_WALLETCONNECT.includes(acct.brandName));
            if (!account) {
                return undefined;
            }
            return account;
        };
        this.getConnectorStatus = (address, brandName) => {
            const sdk = this.getSDK(brandName);
            return sdk.getConnectorStatus(address, brandName);
        };
        this.getSessionStatus = (address, brandName) => {
            const sdk = this.getSDK(brandName);
            return sdk.getSessionStatus(address, brandName);
        };
        this.getSessionAccount = (address, brandName) => {
            const sdk = this.getSDK(brandName);
            return sdk.getSessionAccount(address, brandName);
        };
        this.getSessionNetworkDelay = (address, brandName) => {
            const sdk = this.getSDK(brandName);
            return sdk.getSessionNetworkDelay(address, brandName);
        };
        this.signTransaction = (address, transaction, { brandName = 'JADE' }) => __awaiter(this, void 0, void 0, function* () {
            const sdk = this.getSDK(brandName);
            return sdk.signTransaction(address, transaction, { brandName });
        });
        this.signPersonalMessage = (address, message, { brandName = 'JADE' }) => __awaiter(this, void 0, void 0, function* () {
            const sdk = this.getSDK(brandName);
            return sdk.signPersonalMessage(address, message, { brandName });
        });
        this.signTypedData = (address, data, { brandName = 'JADE' }) => __awaiter(this, void 0, void 0, function* () {
            const sdk = this.getSDK(brandName);
            return sdk.signTypedData(address, data, { brandName });
        });
        this.closeConnector = (account, silent) => {
            const sdk = this.getSDK(account.brandName);
            return sdk.closeConnector(account, silent);
        };
        this.resend = (account) => {
            const sdk = this.getSDK(account.brandName);
            return sdk.resend();
        };
        this.switchEthereumChain = (brandName, chainId) => {
            const sdk = this.getSDK(brandName);
            if (sdk.version === 2)
                return sdk.switchEthereumChain(chainId);
        };
        this.checkClientIsCreate = ({ address, brandName }) => {
            const sdk = this.getSDK(brandName);
            if (sdk.version === 2) {
                return sdk.checkClientIsCreate({ address, brandName });
            }
            else {
                throw new Error('checkConnection is not supported in v1');
            }
        };
        this.v2Whitelist = opts.v2Whitelist;
        this.v1SDK = new v1sdk_1.V1SDK(opts);
        this.v2SDK = new v2sdk_1.V2SDK(opts);
    }
    get accounts() {
        return this._accounts;
    }
    set accounts(accounts) {
        this._accounts = accounts;
        this.v1SDK.accounts = accounts;
        this.v2SDK.accounts = accounts;
    }
    serialize() {
        return Promise.resolve({
            accounts: this.accounts
        });
    }
    deserialize(opts) {
        return __awaiter(this, void 0, void 0, function* () {
            if (opts === null || opts === void 0 ? void 0 : opts.accounts) {
                this.accounts = opts.accounts;
            }
        });
    }
    getSDK(brandName) {
        if (this.v2Whitelist.includes(brandName)) {
            return this.v2SDK;
        }
        return this.v1SDK;
    }
    addAccounts(n) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.accountToAdd)
                throw new Error('There is no address to add');
            if (!(0, web3_utils_1.isAddress)(this.accountToAdd.address)) {
                throw new Error("The address you're are trying to import is invalid");
            }
            const prefixedAddress = (0, ethereumjs_util_1.addHexPrefix)(this.accountToAdd.address);
            if (this.accounts.find((acct) => {
                var _a;
                return acct.address.toLowerCase() === prefixedAddress.toLowerCase() &&
                    acct.brandName === ((_a = this.accountToAdd) === null || _a === void 0 ? void 0 : _a.brandName);
            })) {
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
        });
    }
    getAccounts() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.accounts.map((acct) => acct.address).slice();
        });
    }
    getAccountsWithBrand() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.accounts;
        });
    }
    findAccount(account) {
        var _a;
        return (_a = this.accounts) === null || _a === void 0 ? void 0 : _a.find((acc) => acc.address.toLowerCase() === account.address.toLowerCase() &&
            acc.brandName === account.brandName);
    }
    removeAccount(address, brandName) {
        if (!this.findAccount({
            address,
            brandName
        })) {
            throw new Error(`Address ${address} not found in watch keyring`);
        }
        this.accounts = this.accounts.filter((a) => !(a.address.toLowerCase() === address.toLowerCase() &&
            a.brandName === brandName));
    }
    resetConnect() {
        // clean onAfterSessionCreated
    }
    init(address, brandName, chainIds) {
        return __awaiter(this, void 0, void 0, function* () {
            const sdk = this.getSDK(brandName);
            return sdk.init(address, brandName, chainIds);
        });
    }
    initConnector(brandName, chainIds, account) {
        return __awaiter(this, void 0, void 0, function* () {
            const sdk = this.getSDK(brandName);
            return sdk.initConnector(brandName, chainIds, account);
        });
    }
    scanAccount() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.v2SDK.scanAccount();
        });
    }
    on(event, listener) {
        this.v1SDK.on(event, listener);
        this.v2SDK.on(event, listener);
        return this;
    }
}
exports.WalletConnectKeyring = WalletConnectKeyring;
WalletConnectKeyring.type = 'WalletConnect';
