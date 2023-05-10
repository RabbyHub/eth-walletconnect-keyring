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
exports.DEFAULT_BRIDGE = exports.WALLETCONNECT_SESSION_STATUS_MAP = exports.WALLETCONNECT_STATUS_MAP = exports.keyringType = void 0;
// https://github.com/MetaMask/eth-simple-keyring#the-keyring-class-protocol
const events_1 = require("events");
const web3_utils_1 = require("web3-utils");
const ethereumjs_util_1 = require("ethereumjs-util");
const wc_client_1 = __importDefault(require("@debank/wc-client"));
const utils_1 = require("./utils");
exports.keyringType = 'WalletConnect';
const COMMON_WALLETCONNECT = 'WALLETCONNECT';
const IGNORE_CHECK_WALLET = ['FIREBLOCKS', 'JADE', 'AMBER', 'COBO'];
exports.WALLETCONNECT_STATUS_MAP = {
    PENDING: 1,
    CONNECTED: 2,
    WAITING: 3,
    SIBMITTED: 4,
    REJECTED: 5,
    FAILD: 6
};
exports.WALLETCONNECT_SESSION_STATUS_MAP = {
    CONNECTED: 'CONNECTED',
    DISCONNECTED: 'DISCONNECTED',
    RECEIVED: 'RECEIVED',
    EXPIRED: 'EXPIRED',
    ACCOUNT_ERROR: 'ACCOUNT_ERROR',
    BRAND_NAME_ERROR: 'BRAND_NAME_ERROR',
    REJECTED: 'REJECTED',
    ADDRESS_DUPLICATE: 'ADDRESS_DUPLICATE'
};
const BuildInWalletPeerName = {
    MetaMask: 'MetaMask',
    TP: 'TokenPocket',
    TRUSTWALLET: 'Trust Wallet',
    MATHWALLET: 'MathWallet',
    IMTOKEN: 'imToken'
};
const buildInWallets = Object.keys(BuildInWalletPeerName);
exports.DEFAULT_BRIDGE = 'https://derelay.rabby.io';
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
        this.currentConnectParams = null;
        this.setAccountToAdd = (account) => {
            this.accountToAdd = Object.assign(Object.assign({}, account), { address: account.address.toLowerCase() });
        };
        this.initConnector = (brandName, bridge) => __awaiter(this, void 0, void 0, function* () {
            let address = null;
            const connector = yield this.createConnector(brandName, bridge);
            this.onAfterConnect = (error, payload) => {
                const [account] = payload.params[0].accounts;
                address = account;
                const lowerAddress = address.toLowerCase();
                const conn = this.connectors[`${brandName}-${lowerAddress}`];
                this.currentConnector = this.connectors[`${brandName}-${lowerAddress}`] =
                    Object.assign(Object.assign({}, conn), { status: exports.WALLETCONNECT_STATUS_MAP.CONNECTED, chainId: payload.params[0].chainId, brandName, sessionStatus: 'CONNECTED' });
                this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.CONNECTED, null, Object.assign(Object.assign({}, payload.params[0]), { account }));
            };
            this.onDisconnect = (error, payload) => {
                if (address) {
                    const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
                    if (connector) {
                        this.closeConnector(connector.connector, address, brandName);
                    }
                }
                this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, null, error || payload.params[0]);
            };
            return connector;
        });
        this.createConnector = (brandName, bridge = exports.DEFAULT_BRIDGE) => __awaiter(this, void 0, void 0, function* () {
            if ((0, utils_1.isBrowser)() && localStorage.getItem('walletconnect')) {
                // always clear walletconnect cache
                localStorage.removeItem('walletconnect');
            }
            const connector = new wc_client_1.default({
                bridge: exports.DEFAULT_BRIDGE,
                clientMeta: this.clientMeta
            });
            connector.on('connect', (error, payload) => {
                var _a, _b, _c;
                if ((_a = payload === null || payload === void 0 ? void 0 : payload.params[0]) === null || _a === void 0 ? void 0 : _a.accounts) {
                    const [account] = payload.params[0].accounts;
                    const buildInBrand = this.getBuildInBrandName(brandName, payload.params[0].peerMeta.name);
                    const conn = (this.connectors[`${buildInBrand}-${account.toLowerCase()}`] = {
                        connector,
                        status: connector.connected
                            ? exports.WALLETCONNECT_STATUS_MAP.CONNECTED
                            : exports.WALLETCONNECT_STATUS_MAP.PENDING,
                        chainId: (_b = payload === null || payload === void 0 ? void 0 : payload.params[0]) === null || _b === void 0 ? void 0 : _b.chainId,
                        brandName: buildInBrand,
                        sessionStatus: 'CONNECTED',
                        peerMeta: (_c = payload === null || payload === void 0 ? void 0 : payload.params[0]) === null || _c === void 0 ? void 0 : _c.peerMeta
                    });
                    setTimeout(() => {
                        this.closeConnector(connector, account.address, buildInBrand);
                    }, this.maxDuration);
                    // check brandName
                    if (buildInBrand !== COMMON_WALLETCONNECT &&
                        !this._checkBrandName(buildInBrand, payload)) {
                        conn.sessionStatus = 'BRAND_NAME_ERROR';
                        this.updateSessionStatus('BRAND_NAME_ERROR', {
                            address: account,
                            brandName: buildInBrand
                        });
                        this._close(account, buildInBrand, true);
                        return;
                    }
                    this.updateSessionStatus('CONNECTED', {
                        address: account,
                        brandName: buildInBrand,
                        realBrandName: conn.peerMeta.name
                    });
                    this.emit('sessionAccountChange', {
                        address: account,
                        brandName: buildInBrand,
                        chainId: conn.chainId
                    });
                    this.currentConnector = conn;
                }
                this.currentConnectParams = [error, payload];
                // this.onAfterConnect?.(error, payload);
            });
            connector.on('session_update', (error, payload) => {
                const data = this.getConnectorInfoByClientId(connector.clientId);
                if (!data)
                    return;
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
                }
                else {
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
            });
            connector.on('ack', (error, payload) => {
                const data = this.getConnectorInfoByClientId(connector.clientId);
                if (data) {
                    // todo
                    const conn = this.connectors[data.connectorKey];
                    if (conn.status === exports.WALLETCONNECT_STATUS_MAP.CONNECTED) {
                        this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.WAITING, data.account);
                    }
                    return;
                }
                this.updateSessionStatus('RECEIVED');
            });
            connector.on('session_resumed', (error, payload) => {
                const data = this.getConnectorInfoByClientId(connector.clientId);
                if (!data)
                    return;
                this.connectors[data.connectorKey].sessionStatus = 'CONNECTED';
                this.updateSessionStatus('CONNECTED', {
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
                this.connectors[data.connectorKey].sessionStatus = 'DISCONNECTED';
                this.updateSessionStatus('DISCONNECTED', {
                    address: data.address,
                    brandName: data.brandName
                });
            });
            connector.on('disconnect', (error, payload) => {
                var _a;
                if (((_a = payload.params[0]) === null || _a === void 0 ? void 0 : _a.message) === 'Session Rejected') {
                    this.updateSessionStatus('REJECTED');
                    return;
                }
                const data = this.getConnectorInfoByClientId(connector.clientId);
                if (!data)
                    return;
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
                    this.closeConnector(connector, data.address, data.brandName);
                }
            });
            connector.on('transport_pong', (error, { params: [{ delay }] }) => {
                const data = this.getConnectorInfoByClientId(connector.clientId);
                if (!data)
                    return;
                this.connectors[data.connectorKey].networkDelay = delay;
                this.emit('sessionNetworkDelay', {
                    address: data.address,
                    brandName: data.brandName,
                    delay
                });
            });
            yield connector.createSession();
            return connector;
        });
        this.closeConnector = (connector, address, brandName, 
        // don't broadcast close messages
        silent) => __awaiter(this, void 0, void 0, function* () {
            try {
                this.connectors[`${brandName}-${address.toLowerCase()}`].silent = silent;
                connector === null || connector === void 0 ? void 0 : connector.transportClose();
                if (connector === null || connector === void 0 ? void 0 : connector.connected) {
                    yield connector.killSession();
                }
            }
            catch (e) {
                // NOTHING
            }
            if (address) {
                delete this.connectors[`${brandName}-${address.toLowerCase()}`];
            }
        });
        this.init = (address, brandName) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if ((0, utils_1.isBrowser)() && localStorage.getItem('walletconnect')) {
                // always clear walletconnect cache
                localStorage.removeItem('walletconnect');
            }
            const account = this.accounts.find((acc) => acc.address.toLowerCase() === address.toLowerCase() &&
                acc.brandName === brandName);
            let connector;
            if (account) {
                const lowerAddress = account === null || account === void 0 ? void 0 : account.address.toLowerCase();
                connector = this.connectors[`${brandName}-${lowerAddress}`];
                if (!((_a = connector === null || connector === void 0 ? void 0 : connector.connector) === null || _a === void 0 ? void 0 : _a.connected)) {
                    const newConnector = yield this.createConnector(brandName);
                    connector = Object.assign(Object.assign({}, this.connectors[`${brandName}-${lowerAddress}`]), { connector: newConnector, status: exports.WALLETCONNECT_STATUS_MAP.PENDING });
                }
            }
            // make sure the connector is the latest one before trigger onAfterConnect
            this.currentConnector = connector;
            if ((_b = connector === null || connector === void 0 ? void 0 : connector.connector) === null || _b === void 0 ? void 0 : _b.connected) {
                const account = this.accounts.find((acc) => acc.address.toLowerCase() === address.toLowerCase() &&
                    acc.brandName === brandName);
                connector.status = exports.WALLETCONNECT_STATUS_MAP.CONNECTED;
                this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.CONNECTED, account);
                (_c = this.onAfterConnect) === null || _c === void 0 ? void 0 : _c.call(this, null, {
                    params: [{ accounts: [account.address], chainId: connector.chainId }]
                });
            }
            else if (connector) {
                connector.status = exports.WALLETCONNECT_STATUS_MAP.PENDING;
            }
            this.emit('inited', connector.connector.uri);
            return connector;
        });
        this.getConnectorStatus = (address, brandName) => {
            const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
            if (connector) {
                return connector.status;
            }
            return null;
        };
        this.addAccounts = () => __awaiter(this, void 0, void 0, function* () {
            var _d;
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
                this._close(prefixedAddress, (_d = this.accountToAdd) === null || _d === void 0 ? void 0 : _d.brandName, true);
                this.updateSessionStatus('ADDRESS_DUPLICATE');
                throw new Error("The address you're are trying to import is duplicate");
            }
            this.accounts.push({
                address: prefixedAddress,
                brandName: this.accountToAdd.brandName,
                bridge: this.accountToAdd.bridge || exports.DEFAULT_BRIDGE,
                realBrandName: this.accountToAdd.realBrandName,
                realBrandUrl: this.accountToAdd.realBrandUrl
            });
            return [prefixedAddress];
        });
        this.getSessionStatus = (address, brandName) => {
            const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
            if (!connector) {
                return undefined;
            }
            return connector.sessionStatus;
        };
        this.getSessionAccount = (address, brandName) => {
            const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
            if (!connector) {
                return undefined;
            }
            return {
                address,
                brandName: connector.brandName,
                chainId: connector.chainId
            };
        };
        this.getSessionNetworkDelay = (address, brandName) => {
            const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
            if (connector) {
                return connector.networkDelay;
            }
            return null;
        };
        this.getCommonWalletConnectInfo = (address) => {
            const account = this.accounts.find((acct) => acct.address.toLowerCase() === address.toLowerCase() &&
                acct.brandName === COMMON_WALLETCONNECT);
            if (!account) {
                return undefined;
            }
            return account;
        };
        this.resend = () => {
            var _a;
            (_a = this.onAfterConnect) === null || _a === void 0 ? void 0 : _a.call(this, ...this.currentConnectParams);
        };
        this.deserialize(opts);
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
            if (opts === null || opts === void 0 ? void 0 : opts.clientMeta) {
                this.clientMeta = opts.clientMeta;
            }
        });
    }
    getConnectorInfoByClientId(clientId) {
        const connectorKey = Object.keys(this.connectors).find((key) => { var _a, _b; return ((_b = (_a = this.connectors[key]) === null || _a === void 0 ? void 0 : _a.connector) === null || _b === void 0 ? void 0 : _b.clientId) === clientId; });
        if (!connectorKey) {
            return;
        }
        const [brandName, address] = connectorKey.split('-');
        const account = this.accounts.find((acc) => acc.address.toLowerCase() === address.toLowerCase() &&
            acc.brandName === brandName);
        return {
            brandName,
            address,
            connectorKey,
            account
        };
    }
    getBuildInBrandName(brandName, realBrandName) {
        if (brandName !== COMMON_WALLETCONNECT) {
            return brandName;
        }
        const lowerName = realBrandName === null || realBrandName === void 0 ? void 0 : realBrandName.toLowerCase();
        if (!lowerName)
            return brandName;
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
    // pull the transaction current state, then resolve or reject
    signTransaction(address, transaction, { brandName = 'JADE' }) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = this.accounts.find((acct) => acct.address.toLowerCase() === address.toLowerCase() &&
                acct.brandName === brandName);
            if (!account) {
                throw new Error('Can not find this address');
            }
            const txData = {
                to: transaction.to.toString(),
                value: `0x${transaction.value.toString('hex')}`,
                data: `0x${transaction.data.toString('hex')}`,
                nonce: `0x${transaction.nonce.toString('hex')}`,
                gasLimit: `0x${transaction.gasLimit.toString('hex')}`,
                gasPrice: `0x${transaction.gasPrice
                    ? transaction.gasPrice.toString('hex')
                    : transaction.maxFeePerGas.toString('hex')}`
            };
            const txChainId = transaction.common.chainIdBN().toNumber();
            this.onAfterConnect = (error, payload) => __awaiter(this, void 0, void 0, function* () {
                if (error) {
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, account, error);
                    return;
                }
                if (!this.currentConnector)
                    throw new Error('No connector avaliable');
                this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.CONNECTED, account, payload);
                if (payload) {
                    const { accounts, chainId } = payload.params[0];
                    if (accounts[0].toLowerCase() !== address.toLowerCase() ||
                        chainId !== txChainId) {
                        this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, account, {
                            message: 'Wrong address or chainId',
                            code: accounts[0].toLowerCase() === address.toLowerCase() ? 1000 : 1001
                        });
                        return;
                    }
                    this.currentConnector.chainId = chainId;
                }
                try {
                    const result = yield this.currentConnector.connector.sendTransaction({
                        data: this._normalize(txData.data),
                        from: address,
                        gas: this._normalize(txData.gasLimit),
                        gasPrice: this._normalize(txData.gasPrice),
                        nonce: this._normalize(txData.nonce),
                        to: this._normalize(txData.to),
                        value: this._normalize(txData.value) || '0x0' // prevent 0x
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
                this.closeConnector(this.currentConnector.connector, address, brandName);
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
            const account = this.accounts.find((acct) => acct.address.toLowerCase() === address.toLowerCase() &&
                acct.brandName === brandName);
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
                            code: accounts[0].toLowerCase() === address.toLowerCase() ? 1000 : 1001
                        });
                        return;
                    }
                }
                try {
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.CONNECTED, payload);
                    const result = yield this.currentConnector.connector.signPersonalMessage([
                        message,
                        address
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
                this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.FAILD, error || payload.params[0]);
                this.closeConnector(this.currentConnector.connector, address, brandName);
            };
            yield this.init(account.address, account.brandName);
            return new Promise((resolve) => {
                this.resolvePromise = resolve;
            });
        });
    }
    signTypedData(address, data, { brandName = 'JADE' }) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = this.accounts.find((acct) => acct.address.toLowerCase() === address.toLowerCase() &&
                acct.brandName === brandName);
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
                            code: accounts[0].toLowerCase() === address.toLowerCase() ? 1000 : 1001
                        });
                        return;
                    }
                }
                try {
                    this.updateCurrentStatus(exports.WALLETCONNECT_STATUS_MAP.CONNECTED, account, payload);
                    const result = yield this.currentConnector.connector.signTypedData([
                        address,
                        typeof data === 'string' ? data : JSON.stringify(data)
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
                this.closeConnector(this.currentConnector.connector, address, brandName);
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
        this._close(address, brandName, true);
    }
    _close(address, brandName, silent) {
        const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
        if (connector) {
            this.closeConnector(connector.connector, address, brandName, silent);
        }
    }
    updateCurrentStatus(status, account, payload) {
        var _a;
        if ((status === exports.WALLETCONNECT_STATUS_MAP.REJECTED ||
            status === exports.WALLETCONNECT_STATUS_MAP.FAILD) &&
            (this.currentConnectStatus === exports.WALLETCONNECT_STATUS_MAP.FAILD ||
                this.currentConnectStatus === exports.WALLETCONNECT_STATUS_MAP.REJECTED ||
                this.currentConnectStatus === exports.WALLETCONNECT_STATUS_MAP.SIBMITTED)) {
            return;
        }
        this.currentConnectStatus = status;
        const connector = this.connectors[`${account === null || account === void 0 ? void 0 : account.brandName}-${(_a = account === null || account === void 0 ? void 0 : account.address) === null || _a === void 0 ? void 0 : _a.toLowerCase()}`];
        if (connector) {
            connector.status = status;
        }
        this.emit('statusChange', {
            status,
            account,
            payload
        });
    }
    updateSessionStatus(status, opt) {
        this.emit('sessionStatusChange', Object.assign({ status }, opt));
    }
    _normalize(str) {
        return sanitizeHex(str);
    }
    _checkBrandName(brandName, payload) {
        var _a;
        const name = payload.params[0].peerMeta.name;
        // just check if brandName is in name or name is in brandName
        const lowerName = name.toLowerCase();
        const peerName = (_a = BuildInWalletPeerName[brandName]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        if (IGNORE_CHECK_WALLET.includes(brandName))
            return true;
        if (peerName.includes(lowerName) || lowerName.includes(peerName)) {
            return true;
        }
        return false;
    }
}
WalletConnectKeyring.type = exports.keyringType;
exports.default = WalletConnectKeyring;
