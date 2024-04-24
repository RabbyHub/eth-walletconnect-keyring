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
exports.V2SDK = void 0;
const sign_client_1 = __importDefault(require("@walletconnect/sign-client"));
const cached_1 = require("./cached");
const helper_1 = require("./helper");
const type_1 = require("./type");
const utils_1 = require("@walletconnect/utils");
const utils_2 = require("./utils");
const sdk_1 = require("./sdk");
const web3_utils_1 = require("web3-utils");
class V2SDK extends sdk_1.SDK {
    constructor(opts) {
        super();
        this.accounts = [];
        this.cached = new cached_1.Cached();
        this.version = 2;
        this.loading = false;
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
        this.resend = () => {
            var _a;
            (_a = this.onAfterSessionCreated) === null || _a === void 0 ? void 0 : _a.call(this, this.currentTopic);
        };
        this.closeConnector = (account, silent) => __awaiter(this, void 0, void 0, function* () {
            const topic = this.findTopic(account);
            if (!topic)
                return;
            this._closeConnector({ topic }, silent);
        });
        this.updateSessionStatus = (status, opt) => {
            this.emit('sessionStatusChange', Object.assign({ status }, opt));
            const topic = this.findTopic(opt);
            if (topic) {
                this.cached.updateTopic(topic, {
                    sessionStatus: status
                });
            }
        };
        this.options = opts;
        this.accounts = opts.accounts || [];
        this.initSDK();
    }
    initSDK() {
        return __awaiter(this, void 0, void 0, function* () {
            this.loading = true;
            this.client = undefined;
            this.client = yield sign_client_1.default.init({
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
                    const accountStr = params.event.data[0];
                    const payloadAddress = accountStr.includes(':')
                        ? accountStr.split(':')[2]
                        : accountStr;
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
            this.client.on('session_expire', (session) => {
                this._closeConnector(session);
            });
            const listenerJwtError = () => {
                var _a;
                (_a = this.client) === null || _a === void 0 ? void 0 : _a.core.relayer.provider.once('error', (e) => __awaiter(this, void 0, void 0, function* () {
                    var _b;
                    // error code 3000 meaning the jwt token is expired, need to re-init the client
                    // only appear in connect method
                    if (e.message.includes('3000')) {
                        yield this.initSDK();
                        (_b = this.onAfterSessionCreated) === null || _b === void 0 ? void 0 : _b.call(this, '');
                        console.log('jwt token is expired');
                    }
                    else {
                        listenerJwtError();
                    }
                }));
            };
            listenerJwtError();
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
                value: (0, utils_2.convertToBigint)(transaction.value),
                data: (0, utils_2.bufferToHex)(transaction.data),
                nonce: (0, utils_2.convertToBigint)(transaction.nonce),
                gasLimit: (0, utils_2.convertToBigint)(transaction.gasLimit),
                gasPrice: typeof transaction.gasPrice !== 'undefined'
                    ? (0, utils_2.convertToBigint)(transaction.gasPrice)
                    : (0, utils_2.convertToBigint)(transaction.maxFeePerGas)
            };
            const txChainId = (0, utils_2.getChainId)(transaction.common);
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
                this._closeConnector(payload);
            };
            yield this.init(account.address, account.brandName, txChainId);
            return new Promise((resolve, reject) => {
                this.resolvePromise = resolve;
                this.rejectPromise = reject;
            });
        });
    }
    switchEthereumChain(chainId) {
        return __awaiter(this, void 0, void 0, function* () {
            const payload = this.cached.getTopic(this.currentTopic);
            return this.client.request({
                request: {
                    method: 'wallet_switchEthereumChain',
                    params: [
                        {
                            chainId: (0, web3_utils_1.toHex)(chainId)
                        }
                    ]
                },
                topic: this.currentTopic,
                chainId: [payload.namespace, payload.chainId].join(':')
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
                this._closeConnector(payload);
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
                this._closeConnector(payload);
            };
            yield this.init(account.address, account.brandName);
            return new Promise((resolve) => {
                this.resolvePromise = resolve;
            });
        });
    }
    // initialize or find the session
    init(address, brandName, chainIds) {
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
            const chainIdsArr = !chainIds
                ? [1]
                : Array.isArray(chainIds)
                    ? chainIds
                    : [chainIds];
            const { uri } = yield this.initConnector(brandName, chainIdsArr, account);
            return { uri };
        });
    }
    waitInitClient() {
        return __awaiter(this, void 0, void 0, function* () {
            // wait 1min
            let loopCount = 0;
            while (!this.client && loopCount < 60) {
                if (!this.loading) {
                    try {
                        yield this.initSDK();
                    }
                    catch (e) {
                        console.error(e);
                    }
                }
                loopCount++;
                yield (0, utils_2.wait)(() => this.client, 1000);
            }
        });
    }
    // initialize the connector
    initConnector(brandName, chainIds, account) {
        return __awaiter(this, void 0, void 0, function* () {
            const run = (this.onAfterSessionCreated = () => __awaiter(this, void 0, void 0, function* () {
                yield this.waitInitClient();
                const uri = yield this.createSession(brandName, chainIds, account);
                this.emit('inited', uri);
                return { uri };
            }));
            return run();
        });
    }
    scanAccount() {
        return __awaiter(this, void 0, void 0, function* () {
            const { uri, approval } = yield this.client.connect({
                optionalNamespaces: (0, helper_1.getNamespaces)([1])
            });
            approval().then((session) => {
                const account = (0, helper_1.parseNamespaces)(session.namespaces)[0];
                this.emit('scanAccount', {
                    address: account.address
                });
                this._closeConnector(session, true);
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
    createSession(brandName, chainIds = [1], curAccount) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                requiredNamespaces: (0, helper_1.getRequiredNamespaces)(),
                optionalNamespaces: (0, helper_1.getNamespaces)(chainIds)
            };
            const { uri, approval } = yield this.client.connect(params);
            approval().then((session) => {
                const metaData = session.peer.metadata;
                const account = (0, helper_1.parseNamespaces)(session.namespaces)[0];
                const data = {
                    address: account.address,
                    brandName: session.peer.metadata.name,
                    chainId: account.chainId,
                    namespace: account.namespace,
                    deepLink: uri
                };
                // check brandName
                const buildInBrand = (0, helper_1.getBuildInBrandName)(brandName, metaData.name, !!curAccount);
                if (!type_1.COMMON_WALLETCONNECT.includes(buildInBrand) &&
                    !(0, helper_1.checkBrandName)(buildInBrand, metaData.name)) {
                    this.updateSessionStatus('BRAND_NAME_ERROR', {
                        address: (curAccount === null || curAccount === void 0 ? void 0 : curAccount.address) || data.address,
                        brandName: (curAccount === null || curAccount === void 0 ? void 0 : curAccount.brandName) || buildInBrand
                    });
                    this._closeConnector(session, true);
                    return;
                }
                // check account
                if (curAccount) {
                    if (account.address.toLowerCase() !== (curAccount === null || curAccount === void 0 ? void 0 : curAccount.address.toLowerCase()) ||
                        buildInBrand !== (curAccount === null || curAccount === void 0 ? void 0 : curAccount.brandName)) {
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
                this.updateConnectionStatus(type_1.WALLETCONNECT_STATUS_MAP.CONNECTED, {
                    address: account.address,
                    brandName: buildInBrand
                }, session);
            });
            return uri;
        });
    }
    _closeConnector({ topic }, silent) {
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
    checkClientIsCreate({ address, brandName }) {
        return __awaiter(this, void 0, void 0, function* () {
            const topic = this.findTopic({
                address,
                brandName
            });
            if (!topic) {
                this.updateSessionStatus('DISCONNECTED', {
                    address,
                    brandName
                });
                return type_1.WALLETCONNECT_SESSION_STATUS_MAP.DISCONNECTED;
            }
            yield this.waitInitClient();
            return this.getSessionStatus(address, brandName);
        });
    }
}
exports.V2SDK = V2SDK;
