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
exports.DEFAULT_BRIDGE = exports.WALLETCONNECT_STATUS_MAP = exports.keyringType = void 0;
// https://github.com/MetaMask/eth-simple-keyring#the-keyring-class-protocol
const events_1 = require("events");
const web3_utils_1 = require("web3-utils");
const ethereumjs_util_1 = require("ethereumjs-util");
const client_1 = __importDefault(require("@walletconnect/client"));
const utils_1 = require("./utils");
exports.keyringType = 'WalletConnect';
exports.WALLETCONNECT_STATUS_MAP = {
    PENDING: 1,
    CONNECTED: 2,
    WAITING: 3,
    SIBMITTED: 4,
    REJECTED: 5,
    FAILD: 6,
};
exports.DEFAULT_BRIDGE = 'https://wcbridge.rabby.io';
function sanitizeHex(hex) {
    hex = hex.substring(0, 2) === '0x' ? hex.substring(2) : hex;
    if (hex === '') {
        return '';
    }
    hex = hex.length % 2 !== 0 ? '0' + hex : hex;
    return '0x' + hex;
}
class WalletConnectKeyring extends events_1.EventEmitter {
    constructor(opts) {
        super();
        this.type = exports.keyringType;
        this.accounts = [];
        this.accountToAdd = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
        this.onAfterConnect = null;
        this.onDisconnect = null;
        this.currentConnectStatus = exports.WALLETCONNECT_STATUS_MAP.PENDING;
        this.maxDuration = 1800000; // 30 mins hour by default
        this.clientMeta = null;
        this.currentConnector = null;
        this.connectors = {};
        this.setAccountToAdd = (account) => {
            this.accountToAdd = Object.assign(Object.assign({}, account), { address: account.address.toLowerCase() });
        };
        this.initConnector = (brandName, bridge) => __awaiter(this, void 0, void 0, function* () {
            let address = null;
            const connector = yield this.createConnector(brandName, bridge);
            this.onAfterConnect = (error, payload) => {
                const [account] = payload.params[0].accounts;
                address = account;
                this.connectors[address.toLowerCase()] = {
                    status: exports.WALLETCONNECT_STATUS_MAP.CONNECTED,
                    connector,
                    chainId: payload.params[0].chainId,
                    brandName,
                };
                this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.CONNECTED, null, account);
            };
            this.onDisconnect = (error, payload) => {
                if (address) {
                    const connector = this.connectors[address.toLowerCase()];
                    if (connector) {
                        this.closeConnector(connector.connector, address);
                    }
                }
                this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, null, error || payload.params[0]);
            };
            return connector;
        });
        this.createConnector = (brandName, bridge) => __awaiter(this, void 0, void 0, function* () {
            if (localStorage.getItem('walletconnect')) {
                // always clear walletconnect cache
                localStorage.removeItem('walletconnect');
            }
            const connector = new client_1.default({
                bridge: bridge || exports.DEFAULT_BRIDGE,
                clientMeta: this.clientMeta,
            });
            connector.on('connect', (error, payload) => {
                var _a, _b;
                if ((_a = payload === null || payload === void 0 ? void 0 : payload.params[0]) === null || _a === void 0 ? void 0 : _a.accounts) {
                    const [account] = payload.params[0].accounts;
                    this.connectors[account.toLowerCase()] = {
                        connector,
                        status: connector.connected
                            ? exports.WALLETCONNECT_STATUS_MAP.CONNECTED
                            : exports.WALLETCONNECT_STATUS_MAP.PENDING,
                        chainId: (_b = payload === null || payload === void 0 ? void 0 : payload.params[0]) === null || _b === void 0 ? void 0 : _b.chainId,
                        brandName,
                    };
                    setTimeout(() => {
                        this.closeConnector(connector, account.address);
                    }, this.maxDuration);
                }
                this.onAfterConnect && this.onAfterConnect(error, payload);
            });
            connector.on('disconnect', (error, payload) => {
                this.onDisconnect && this.onDisconnect(error, payload);
            });
            yield connector.createSession();
            return connector;
        });
        this.closeConnector = (connector, address) => __awaiter(this, void 0, void 0, function* () {
            try {
                connector.transportClose();
                if (connector.connected) {
                    yield connector.killSession();
                }
            }
            catch (e) {
                // NOTHING
            }
            delete this.connectors[address];
        });
        this.init = (address, brandName) => __awaiter(this, void 0, void 0, function* () {
            if (localStorage.getItem('walletconnect')) {
                // always clear walletconnect cache
                localStorage.removeItem('walletconnect');
            }
            const account = this.accounts.find((acc) => acc.address === address && acc.brandName === brandName);
            if (!account) {
                throw new Error('Can not find this address');
            }
            let connector = this.connectors[account.address.toLowerCase()];
            if (!connector || !connector.connector.connected) {
                const newConnector = yield this.createConnector(brandName, account.bridge);
                connector = {
                    connector: newConnector,
                    status: exports.WALLETCONNECT_STATUS_MAP.PENDING,
                    brandName,
                };
            }
            if (connector.connector.connected) {
                connector.status = exports.WALLETCONNECT_STATUS_MAP.CONNECTED;
                this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.CONNECTED, account);
                this.onAfterConnect &&
                    this.onAfterConnect(null, {
                        params: [{ accounts: [account.address], chainId: connector.chainId }],
                    });
            }
            else {
                connector.status = exports.WALLETCONNECT_STATUS_MAP.PENDING;
            }
            this.currentConnector = connector;
            this.emit('inited', connector.connector.uri);
            return connector;
        });
        this.getConnectorStatus = (address, brandName) => {
            const connector = this.connectors[address.toLowerCase()];
            if (connector) {
                return connector.status;
            }
            return null;
        };
        this.addAccounts = () => __awaiter(this, void 0, void 0, function* () {
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
                throw new Error("The address you're are trying to import is duplicate");
            }
            this.accounts.push({
                address: prefixedAddress,
                brandName: this.accountToAdd.brandName,
                bridge: this.accountToAdd.bridge || exports.DEFAULT_BRIDGE,
            });
            return [prefixedAddress];
        });
        this.deserialize(opts);
    }
    serialize() {
        return Promise.resolve({
            accounts: this.accounts,
        });
    }
    deserialize(opts) {
        return __awaiter(this, void 0, void 0, function* () {
            if (opts === null || opts === void 0 ? void 0 : opts.accounts) {
                this.accounts = opts.accounts;
            }
            if (opts === null || opts === void 0 ? void 0 : opts.clientMeta) {
                this.clientMeta = opts.clientMeta;
            }
        });
    }
    // pull the transaction current state, then resolve or reject
    signTransaction(address, transaction, { brandName = 'JADE' }) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = this.accounts.find((acct) => acct.address === address && acct.brandName === brandName);
            if (!account) {
                throw new Error('Can not find this address');
            }
            this.onAfterConnect = (error, payload) => __awaiter(this, void 0, void 0, function* () {
                if (error) {
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, account, error);
                    return;
                }
                if (!this.currentConnector)
                    throw new Error('No connector avaliable');
                this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.CONNECTED, account, payload);
                yield (0, utils_1.wait)(() => {
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.WAITING, account, payload);
                }, 1000);
                if (payload) {
                    const { accounts, chainId } = payload.params[0];
                    if (accounts[0].toLowerCase() !== address.toLowerCase() ||
                        chainId !== transaction.getChainId()) {
                        this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, account, {
                            message: 'Wrong address or chainId',
                            code: accounts[0].toLowerCase() === address.toLowerCase() ? 1000 : 1001,
                        });
                        return;
                    }
                    this.currentConnector.chainId = chainId;
                }
                try {
                    const result = yield this.currentConnector.connector.sendTransaction({
                        data: this._normalize(transaction.data),
                        from: address,
                        gas: this._normalize(transaction.gas),
                        gasPrice: this._normalize(transaction.gasPrice),
                        nonce: this._normalize(transaction.nonce),
                        to: this._normalize(transaction.to),
                        value: this._normalize(transaction.value) || '0x0', // prevent 0x
                    });
                    this.resolvePromise(result);
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.SIBMITTED, account, result);
                }
                catch (e) {
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.REJECTED, account, e);
                }
            });
            this.onDisconnect = (error, payload) => {
                if (!this.currentConnector)
                    throw new Error('No connector avaliable');
                this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, error || payload.params[0]);
                this.closeConnector(this.currentConnector.connector, address);
            };
            yield this.init(account.address, account.brandName);
            return new Promise((resolve, reject) => {
                this.resolvePromise = resolve;
                this.rejectPromise = reject;
            });
        });
    }
    signPersonalMessage(address, message, { brandName = 'JADE' }) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = this.accounts.find((acct) => acct.address === address && acct.brandName === brandName);
            if (!account) {
                throw new Error('Can not find this address');
            }
            this.onAfterConnect = (error, payload) => __awaiter(this, void 0, void 0, function* () {
                if (error) {
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, account, error);
                    return;
                }
                if (!this.currentConnector)
                    throw new Error('No connector avaliable');
                const { accounts } = payload.params[0];
                if (payload) {
                    if (accounts[0].toLowerCase() !== address.toLowerCase()) {
                        this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, account, {
                            message: 'Wrong address or chainId',
                            code: accounts[0].toLowerCase() === address.toLowerCase() ? 1000 : 1001,
                        });
                        return;
                    }
                }
                try {
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.CONNECTED, payload);
                    yield (0, utils_1.wait)(() => {
                        this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.WAITING, payload);
                    }, 1000);
                    const result = yield this.currentConnector.connector.signPersonalMessage([message, address]);
                    this.resolvePromise(result);
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.SIBMITTED, account, result);
                }
                catch (e) {
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.REJECTED, account, e);
                }
            });
            this.onDisconnect = (error, payload) => {
                if (!this.currentConnector)
                    throw new Error('No connector avaliable');
                this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, error || payload.params[0]);
                this.closeConnector(this.currentConnector.connector, address);
            };
            yield this.init(account.address, account.brandName);
            return new Promise((resolve) => {
                this.resolvePromise = resolve;
            });
        });
    }
    signTypedData(address, data, { brandName = 'JADE' }) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = this.accounts.find((acct) => acct.address === address && acct.brandName === brandName);
            if (!account) {
                throw new Error('Can not find this address');
            }
            this.onAfterConnect = (error, payload) => __awaiter(this, void 0, void 0, function* () {
                if (error) {
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, account, error);
                    return;
                }
                if (!this.currentConnector)
                    throw new Error('No connector avaliable');
                if (payload) {
                    const { accounts } = payload.params[0];
                    if (accounts[0].toLowerCase() !== address.toLowerCase()) {
                        this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, account, {
                            message: 'Wrong address or chainId',
                            code: accounts[0].toLowerCase() === address.toLowerCase() ? 1000 : 1001,
                        });
                        return;
                    }
                }
                try {
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.CONNECTED, account, payload);
                    yield (0, utils_1.wait)(() => {
                        this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.WAITING, account, payload);
                    }, 1000);
                    const result = yield this.currentConnector.connector.signTypedData([
                        address,
                        data,
                    ]);
                    this.resolvePromise(result);
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.SIBMITTED, account, result);
                }
                catch (e) {
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.REJECTED, account, e);
                }
            });
            this.onDisconnect = (error, payload) => {
                if (!this.currentConnector)
                    throw new Error('No connector avaliable');
                this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, account, error || payload.params[0]);
                this.closeConnector(this.currentConnector.connector, address);
            };
            yield this.init(account.address, account.brandName);
            return new Promise((resolve) => {
                this.resolvePromise = resolve;
            });
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
    removeAccount(address, brandName) {
        if (!this.accounts.find((account) => account.address.toLowerCase() === address.toLowerCase() &&
            account.brandName === brandName)) {
            throw new Error(`Address ${address} not found in watch keyring`);
        }
        this.accounts = this.accounts.filter((a) => !(a.address.toLowerCase() === address.toLowerCase() &&
            a.brandName === brandName));
    }
    updateCurrentStatus(status, account, payload) {
        if ((status === exports.WALLETCONNECT_STATUS_MAP.REJECTED ||
            status === exports.WALLETCONNECT_STATUS_MAP.FAILD) &&
            (this.currentConnectStatus === exports.WALLETCONNECT_STATUS_MAP.FAILD ||
                this.currentConnectStatus === exports.WALLETCONNECT_STATUS_MAP.REJECTED ||
                this.currentConnectStatus === exports.WALLETCONNECT_STATUS_MAP.SIBMITTED)) {
            return;
        }
        this.currentConnectStatus = status;
        this.emit('statusChange', {
            status,
            account,
            payload,
        });
    }
    _normalize(buf) {
        return sanitizeHex((0, ethereumjs_util_1.bufferToHex)(buf).toString());
    }
}
WalletConnectKeyring.type = exports.keyringType;
exports.default = WalletConnectKeyring;
