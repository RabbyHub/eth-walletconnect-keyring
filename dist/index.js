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
const sign_client_1 = __importDefault(require("@walletconnect/sign-client"));
const cached_1 = require("./cached");
const events_1 = __importDefault(require("events"));
const helper_1 = require("./helper");
const type_1 = require("./type");
const utils_1 = require("@walletconnect/utils");
const web3_utils_1 = require("web3-utils");
const ethereumjs_util_1 = require("ethereumjs-util");
const utils_2 = require("./utils");
class WalletConnectKeyring extends events_1.default {
    constructor(opts) {
        super();
        this.type = 'WalletConnect';
        this.accounts = [];
        this.cached = new cached_1.Cached();
        this.accountToAdd = null;
        this.setAccountToAdd = (account) => {
            this.accountToAdd = Object.assign(Object.assign({}, account), { address: account.address.toLowerCase() });
        };
        this.getSessionStatus = (address, brandName) => {
            const topic = this.findTopic({
                address,
                brandName
            });
            if (topic) {
                const data = this.cached.getTopic(topic);
                return data === null || data === void 0 ? void 0 : data.sessionStatus;
            }
        };
        this.getSessionAccount = (address, brandName) => {
            const topic = this.findTopic({
                address,
                brandName
            });
            if (topic) {
                return this.cached.getTopic(topic);
            }
        };
        this.getSessionNetworkDelay = (address, brandName) => {
            const topic = this.findTopic({
                address,
                brandName
            });
            if (topic) {
                const data = this.cached.getTopic(topic);
                return data === null || data === void 0 ? void 0 : data.networkDelay;
            }
        };
        this.getCommonWalletConnectInfo = (address) => {
            const account = this.accounts.find((acct) => acct.address.toLowerCase() === address.toLowerCase() &&
                type_1.COMMON_WALLETCONNECT.includes(acct.brandName));
            if (!account) {
                return undefined;
            }
            return account;
        };
        this.resend = () => {
            var _a;
            (_a = this.onAfterSessionCreated) === null || _a === void 0 ? void 0 : _a.call(this, this.currentTopic);
        };
        this.deserialize(opts);
        this.options = opts;
        this.initSDK();
    }
    serialize() {
        return Promise.resolve({
            accounts: this.accounts
        });
    }
    initSDK() {
        return __awaiter(this, void 0, void 0, function* () {
            this.client = yield sign_client_1.default.init({
                projectId: this.options.projectId,
                metadata: this.options.clientMeta
            });
            // clear inactive session
            const activeSessions = this.client.session.keys;
            this.cached.getAllTopics().forEach((topic) => {
                if (!activeSessions.includes(topic)) {
                    this.closeConnector({ topic });
                }
            });
            this.client.on('session_delete', (session) => {
                console.log('session_delete', session);
                this.closeConnector({ topic: session.topic });
            });
            this.client.on('session_update', console.log);
            this.client.on('session_event', ({ topic, params }) => {
                console.log('session_event', topic, params);
                const data = this.cached.getTopic(topic);
                if (!data)
                    return;
                if (params.event.name === helper_1.DEFAULT_EIP_155_EVENTS.ETH_CHAIN_CHANGED) {
                    this.emit('sessionAccountChange', {
                        address: data.address,
                        brandName: data.brandName,
                        chainId: params.event.data
                    });
                    this.cached.updateTopic(topic, {
                        chainId: params.event.data
                    });
                }
                if (params.event.name === helper_1.DEFAULT_EIP_155_EVENTS.ETH_ACCOUNTS_CHANGED) {
                    const payloadAddress = params.event.data[0].split(':')[2];
                    if (payloadAddress.toLowerCase() !== (data === null || data === void 0 ? void 0 : data.address.toLowerCase())) {
                        this.updateSessionStatus('ACCOUNT_ERROR', {
                            address: data.address,
                            brandName: data.brandName
                        });
                    }
                    else {
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
                this.closeConnector(session);
            });
        });
    }
    deserialize(opts) {
        return __awaiter(this, void 0, void 0, function* () {
            if (opts === null || opts === void 0 ? void 0 : opts.accounts) {
                this.accounts = opts.accounts;
            }
        });
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
                this.closeConnector({ topic: this.currentTopic }, true);
                this.updateSessionStatus('ADDRESS_DUPLICATE');
                throw new Error("The address you're are trying to import is duplicate");
            }
            this.accounts.push({
                address: prefixedAddress,
                brandName: this.accountToAdd.brandName,
                realBrandName: this.accountToAdd.realBrandName,
                realBrandUrl: this.accountToAdd.realBrandUrl
            });
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
    signTransaction(address, transaction, { brandName = 'JADE' }) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = this.findAccount({
                address,
                brandName
            });
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
            this.onAfterSessionCreated = (topic) => __awaiter(this, void 0, void 0, function* () {
                const payload = this.cached.getTopic(topic);
                if (payload) {
                    if (payload.address.toLowerCase() !== address.toLowerCase() ||
                        payload.chainId !== txChainId) {
                        this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, account, {
                            message: 'Wrong address or chainId',
                            code: address.toLowerCase() === address.toLowerCase() ? 1000 : 1001
                        });
                        return;
                    }
                }
                try {
                    const result = yield this.client.request({
                        request: {
                            method: 'eth_sendTransaction',
                            params: [
                                {
                                    data: (0, helper_1.sanitizeHex)(txData.data),
                                    from: address,
                                    gas: (0, helper_1.sanitizeHex)(txData.gasLimit),
                                    gasPrice: (0, helper_1.sanitizeHex)(txData.gasPrice),
                                    nonce: (0, helper_1.sanitizeHex)(txData.nonce),
                                    to: (0, helper_1.sanitizeHex)(txData.to),
                                    value: (0, helper_1.sanitizeHex)(txData.value) || '0x0' // prevent 0x
                                }
                            ]
                        },
                        topic,
                        chainId: [payload.namespace, txChainId].join(':')
                    });
                    this.resolvePromise(result);
                    this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.SIBMITTED, account, result);
                }
                catch (e) {
                    console.error(e);
                    this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.REJECTED, account, e);
                }
            });
            this.onDisconnect = (error, payload) => {
                this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, error);
                this.closeConnector(payload);
            };
            yield this.init(account.address, account.brandName, txChainId);
            return new Promise((resolve, reject) => {
                this.resolvePromise = resolve;
                this.rejectPromise = reject;
            });
        });
    }
    signPersonalMessage(address, message, { brandName = 'JADE' }) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = this.findAccount({
                address,
                brandName
            });
            if (!account) {
                throw new Error('Can not find this address');
            }
            this.onAfterSessionCreated = (topic) => __awaiter(this, void 0, void 0, function* () {
                const payload = this.cached.getTopic(topic);
                if (payload) {
                    if (payload.address.toLowerCase() !== address.toLowerCase()) {
                        this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, account, {
                            message: 'Wrong address or chainId',
                            code: address.toLowerCase() === address.toLowerCase() ? 1000 : 1001
                        });
                        return;
                    }
                }
                try {
                    const result = yield this.client.request({
                        request: {
                            method: 'personal_sign',
                            params: [message, address]
                        },
                        topic,
                        chainId: [payload.namespace, payload.chainId].join(':')
                    });
                    this.resolvePromise(result);
                    this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.SIBMITTED, account, result);
                }
                catch (e) {
                    console.error(e);
                    this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.REJECTED, account, e);
                }
            });
            this.onDisconnect = (error, payload) => {
                this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, error);
                this.closeConnector(payload);
            };
            yield this.init(account.address, account.brandName);
            return new Promise((resolve) => {
                this.resolvePromise = resolve;
            });
        });
    }
    signTypedData(address, data, { brandName = 'JADE' }) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = this.findAccount({
                address,
                brandName
            });
            if (!account) {
                throw new Error('Can not find this address');
            }
            this.onAfterSessionCreated = (topic) => __awaiter(this, void 0, void 0, function* () {
                const payload = this.cached.getTopic(topic);
                if (payload) {
                    if (payload.address.toLowerCase() !== address.toLowerCase()) {
                        this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, account, {
                            message: 'Wrong address or chainId',
                            code: address.toLowerCase() === address.toLowerCase() ? 1000 : 1001
                        });
                        return;
                    }
                }
                try {
                    this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.CONNECTED, account, payload);
                    const result = yield this.client.request({
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
                    this.resolvePromise(result);
                    this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.SIBMITTED, account, result);
                }
                catch (e) {
                    console.error(e);
                    this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.REJECTED, account, e);
                }
            });
            this.onDisconnect = (error, payload) => {
                this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, account, error);
                this.closeConnector(payload);
            };
            yield this.init(account.address, account.brandName);
            return new Promise((resolve) => {
                this.resolvePromise = resolve;
            });
        });
    }
    // initialize or find the session
    init(address, brandName, chainId) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const account = this.findAccount({ address, brandName });
            if (!account) {
                throw new Error('Can not find this address');
            }
            const topic = this.findTopic(account);
            if (topic) {
                this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.CONNECTED, account);
                (_a = this.onAfterSessionCreated) === null || _a === void 0 ? void 0 : _a.call(this, topic);
                // switch connection status?
                return;
            }
            const { uri } = yield this.initConnector(brandName, chainId, account);
            this.emit('inited', uri);
            return { uri };
        });
    }
    // initialize the connector
    initConnector(brandName, chainId, account) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.client) {
                yield (0, utils_2.wait)(() => this.client, 500);
            }
            const uri = yield this.createSession(brandName, chainId, account);
            return { uri };
        });
    }
    scanAccount() {
        return __awaiter(this, void 0, void 0, function* () {
            const { uri, approval } = yield this.client.connect({
                requiredNamespaces: (0, helper_1.getRequiredNamespaces)(['eip155:1'])
            });
            approval().then((session) => {
                const account = (0, helper_1.parseNamespaces)(session.namespaces)[0];
                this.emit('scanAccount', {
                    address: account.address
                });
                this.closeConnector(session, true);
            });
            return uri;
        });
    }
    getConnectorStatus(address, brandName) {
        const topic = this.findTopic({
            address,
            brandName
        });
        if (topic) {
            const data = this.cached.getTopic(topic);
            return data === null || data === void 0 ? void 0 : data.status;
        }
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
    findTopic(account) {
        if (!account)
            return;
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
    createSession(brandName, chainId = 1, curAccount) {
        return __awaiter(this, void 0, void 0, function* () {
            const { uri, approval } = yield this.client.connect({
                requiredNamespaces: (0, helper_1.getRequiredNamespaces)([`eip155:${chainId}`])
            });
            approval().then((session) => {
                const metaData = session.peer.metadata;
                const account = (0, helper_1.parseNamespaces)(session.namespaces)[0];
                const data = {
                    address: account.address,
                    brandName: session.peer.metadata.name,
                    chainId: account.chainId,
                    namespace: account.namespace
                };
                // check brandName
                const buildInBrand = (0, helper_1.getBuildInBrandName)(brandName, metaData.name, !!curAccount);
                if (!type_1.COMMON_WALLETCONNECT.includes(buildInBrand) &&
                    !(0, helper_1.checkBrandName)(buildInBrand, metaData.name)) {
                    this.updateSessionStatus('BRAND_NAME_ERROR', {
                        address: (curAccount === null || curAccount === void 0 ? void 0 : curAccount.address) || data.address,
                        brandName: (curAccount === null || curAccount === void 0 ? void 0 : curAccount.brandName) || buildInBrand
                    });
                    this.closeConnector(session, true);
                    return;
                }
                // check account
                if (curAccount) {
                    if (account.address.toLowerCase() !== (curAccount === null || curAccount === void 0 ? void 0 : curAccount.address.toLowerCase()) ||
                        buildInBrand !== (curAccount === null || curAccount === void 0 ? void 0 : curAccount.brandName)) {
                        this.updateSessionStatus('ACCOUNT_ERROR', curAccount);
                        this.closeConnector(session, true);
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
                this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.CONNECTED, {
                    address: account.address,
                    brandName: buildInBrand
                }, session);
            });
            return uri;
        });
    }
    closeConnector({ topic }, silent) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.client.disconnect({
                    topic,
                    reason: (0, utils_1.getSdkError)('USER_DISCONNECTED')
                });
            }
            catch (e) { }
            const payload = this.cached.getTopic(topic);
            this.cached.deleteTopic(topic);
            if (!silent) {
                this.emit('sessionStatusChange', Object.assign(Object.assign({}, payload), { status: type_1.WALLETCONNECT_SESSION_STATUS_MAP.DISCONNECTED }));
            }
        });
    }
    findAccount(account) {
        var _a;
        return (_a = this.accounts) === null || _a === void 0 ? void 0 : _a.find((acc) => acc.address.toLowerCase() === account.address.toLowerCase() &&
            acc.brandName === account.brandName);
    }
    updateConnectionStatus(status, account, payload) {
        this.emit('statusChange', {
            status,
            account,
            payload
        });
        const topic = this.findTopic(account);
        this.cached.updateTopic(topic, {
            status
        });
    }
    updateSessionStatus(status, opt) {
        this.emit('sessionStatusChange', Object.assign({ status }, opt));
        const topic = this.findTopic(opt);
        if (topic) {
            this.cached.updateTopic(topic, {
                sessionStatus: status
            });
        }
    }
}
exports.WalletConnectKeyring = WalletConnectKeyring;
WalletConnectKeyring.type = 'WalletConnect';
