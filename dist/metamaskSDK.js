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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaMaskSDK = void 0;
// @ts-nocheck
const sdk_1 = require("@metamask/sdk");
const utils_1 = require("./utils");
const sdk_2 = require("./sdk");
const helper_1 = require("./helper");
const type_1 = require("./type");
class MetaMaskSDK extends sdk_2.SDK {
    constructor(opts) {
        super();
        this.accounts = [];
        this.accountToAdd = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
        this.onAfterConnect = null;
        this.onDisconnect = null;
        this.currentConnectStatus = type_1.WALLETCONNECT_STATUS_MAP.PENDING;
        this.maxDuration = 1800000; // 30 mins hour by default
        this.currentConnector = null;
        this.connectors = {};
        this.currentConnectParams = null;
        this.version = 3;
        this.initConnector = (brandName) => __awaiter(this, void 0, void 0, function* () {
            let address = null;
            const connector = yield this.createConnector(brandName);
            this.onAfterConnect = (error, payload) => {
                const [account] = payload.params[0].accounts;
                address = account;
                const lowerAddress = address.toLowerCase();
                const conn = this.connectors[`${brandName}-${lowerAddress}`];
                this.currentConnector = this.connectors[`${brandName}-${lowerAddress}`] =
                    Object.assign(Object.assign({}, conn), { status: type_1.WALLETCONNECT_STATUS_MAP.CONNECTED, chainId: payload.params[0].chainId, brandName, sessionStatus: 'CONNECTED' });
                this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.CONNECTED, null, Object.assign(Object.assign({}, payload.params[0]), { account }));
            };
            this.onDisconnect = (error, payload) => {
                if (address) {
                    const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
                    if (connector) {
                        this._closeConnector(connector.connector, address, brandName);
                    }
                }
                this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, null, error || payload.params[0]);
            };
            this.emit('inited', connector.getUniversalLink());
            return Object.assign(Object.assign({}, connector), { uri: connector.getUniversalLink() });
        });
        this.createConnector = (brandName, curAccount) => __awaiter(this, void 0, void 0, function* () {
            const connector = new sdk_1.MetaMaskSDK(this.metamaskOptions);
            connector.on('connecting', (data) => {
                console.log('connecting', data);
            });
            connector.on('_initialized', (data) => {
                console.log('_initialized', data);
            });
            connector.on('accountsChanged', (data) => {
                console.log('accountsChanged', data);
            });
            connector.on('connect', ({ chainId }) => {
                console.log('connect', chainId);
                // if (payload?.params[0]?.accounts) {
                //   const [account] = payload.params[0].accounts;
                //   const buildInBrand = this.getBuildInBrandName(
                //     brandName,
                //     payload.params[0].peerMeta?.name,
                //     // if is old account and is desktop, should ignore check
                //     !!curAccount
                //   );
                //   const conn = (this.connectors[
                //     `${buildInBrand}-${account.toLowerCase()}`
                //   ] = {
                //     connector,
                //     status: connector.connected
                //       ? WALLETCONNECT_STATUS_MAP.CONNECTED
                //       : WALLETCONNECT_STATUS_MAP.PENDING,
                //     chainId: payload?.params[0]?.chainId,
                //     brandName: buildInBrand,
                //     sessionStatus: 'CONNECTED',
                //     peerMeta: payload?.params[0]?.peerMeta
                //   } as Connector);
                //   setTimeout(() => {
                //     this._closeConnector(connector, account, buildInBrand);
                //   }, this.maxDuration);
                //   // check brandName
                //   if (
                //     !COMMON_WALLETCONNECT.includes(buildInBrand) &&
                //     !this._checkBrandName(buildInBrand, payload)
                //   ) {
                //     conn.sessionStatus = 'BRAND_NAME_ERROR';
                //     this.updateSessionStatus('BRAND_NAME_ERROR', {
                //       address: curAccount?.address || account,
                //       brandName: curAccount?.brandName || buildInBrand
                //     });
                //     this._close(account, buildInBrand, true);
                //     return;
                //   }
                //   if (curAccount) {
                //     if (
                //       account.toLowerCase() !== curAccount?.address.toLowerCase() ||
                //       buildInBrand !== curAccount?.brandName
                //     ) {
                //       conn.sessionStatus = 'ACCOUNT_ERROR';
                //       this.updateSessionStatus('ACCOUNT_ERROR', curAccount);
                //       this._close(account, buildInBrand, true);
                //       return;
                //     }
                //   }
                //   this.updateSessionStatus('CONNECTED', {
                //     address: account,
                //     brandName: buildInBrand,
                //     realBrandName: conn.peerMeta?.name
                //   });
                //   this.emit('sessionAccountChange', {
                //     address: account,
                //     brandName: buildInBrand,
                //     chainId: conn.chainId
                //   });
                //   this.currentConnector = conn;
                //   this.updateCurrentStatus(WALLETCONNECT_STATUS_MAP.CONNECTED, null, {
                //     ...payload.params[0],
                //     account
                //   });
                // }
                // this.currentConnectParams = [error, payload];
            });
            // connector.on(
            //   'session_update',
            //   (
            //     error,
            //     payload: {
            //       event: string;
            //       params: {
            //         accounts: string[];
            //         chainId: number;
            //       }[];
            //     }
            //   ) => {
            //     const data = this.getConnectorInfoByClientId(connector.clientId);
            //     if (!data) return;
            //     const { connectorKey, address: _address, brandName: _brandName } = data;
            //     const _chainId = this.connectors[connectorKey].chainId;
            //     const updateAddress = payload.params[0].accounts[0];
            //     const updateChain = payload.params[0].chainId;
            //     if (updateAddress.toLowerCase() !== _address.toLowerCase()) {
            //       this.connectors[connectorKey].sessionStatus = 'ACCOUNT_ERROR';
            //       this.updateSessionStatus('ACCOUNT_ERROR', {
            //         address: _address,
            //         brandName: _brandName
            //       });
            //     } else {
            //       this.connectors[connectorKey].sessionStatus = 'CONNECTED';
            //       this.updateSessionStatus('CONNECTED', {
            //         address: _address,
            //         brandName: _brandName
            //       });
            //     }
            //     this.emit('sessionAccountChange', {
            //       address: _address,
            //       brandName: _brandName,
            //       chainId: updateChain
            //     });
            //     this.connectors[connectorKey].chainId = updateChain;
            //   }
            // );
            // connector.on('disconnect', (error, payload) => {
            //   if (payload.params[0]?.message.toLowerCase().includes('rejected')) {
            //     this.updateSessionStatus('REJECTED');
            //     return;
            //   }
            //   const data = this.getConnectorInfoByClientId(connector.clientId);
            //   if (!data) return;
            //   const { silent } = this.connectors[data.connectorKey];
            //   if (!silent) {
            //     this.connectors[data.connectorKey].sessionStatus = 'DISCONNECTED';
            //     this.updateSessionStatus('DISCONNECTED', {
            //       address: data.address,
            //       brandName: data.brandName
            //     });
            //   }
            //   this.onDisconnect && this.onDisconnect(error, payload);
            // });
            yield connector.init();
            yield connector.connect();
            return connector;
        });
        this.closeConnector = (account, silent) => __awaiter(this, void 0, void 0, function* () {
            const { brandName, address } = account;
            const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
            this._closeConnector(connector.connector, address, brandName, silent);
        });
        this._closeConnector = (connector, address, brandName, 
        // don't broadcast close messages
        silent) => __awaiter(this, void 0, void 0, function* () {
            // try {
            //   this.connectors[`${brandName}-${address.toLowerCase()}`].silent = silent;
            //   connector?.transportClose();
            //   if (connector?.connected) {
            //     await connector.killSession();
            //   }
            // } catch (e) {
            //   // NOTHING
            // }
            // if (address) {
            //   delete this.connectors[`${brandName}-${address.toLowerCase()}`];
            // }
        });
        this.init = (address, brandName) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if ((0, utils_1.isBrowser)() && typeof localStorage !== 'undefined') {
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
                    const newConnector = yield this.createConnector(brandName, account);
                    connector = Object.assign(Object.assign({}, this.connectors[`${brandName}-${lowerAddress}`]), { connector: newConnector, status: type_1.WALLETCONNECT_STATUS_MAP.PENDING });
                }
            }
            // make sure the connector is the latest one before trigger onAfterConnect
            this.currentConnector = connector;
            if ((_b = connector === null || connector === void 0 ? void 0 : connector.connector) === null || _b === void 0 ? void 0 : _b.connected) {
                const account = this.accounts.find((acc) => acc.address.toLowerCase() === address.toLowerCase() &&
                    acc.brandName === brandName);
                connector.status = type_1.WALLETCONNECT_STATUS_MAP.CONNECTED;
                this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.CONNECTED, account);
                (_c = this.onAfterConnect) === null || _c === void 0 ? void 0 : _c.call(this, null, {
                    params: [{ accounts: [account.address], chainId: connector.chainId }]
                });
            }
            else if (connector) {
                connector.status = type_1.WALLETCONNECT_STATUS_MAP.PENDING;
            }
            const uri = connector === null || connector === void 0 ? void 0 : connector.getUniversalLink();
            if (uri) {
                this.emit('inited', uri);
            }
            return Object.assign(Object.assign({}, connector), { uri });
        });
        this.getConnectorStatus = (address, brandName) => {
            const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
            if (connector) {
                return connector.status;
            }
            return null;
        };
        this.updateSessionStatus = (status, opt) => {
            this.emit('sessionStatusChange', Object.assign({ status }, opt));
        };
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
        this.resend = () => {
            var _a;
            (_a = this.onAfterConnect) === null || _a === void 0 ? void 0 : _a.call(this, ...this.currentConnectParams);
        };
        this.switchEthereumChain = () => {
            throw new Error('Method not implemented.');
        };
        this.accounts = opts.accounts || [];
        this.metamaskOptions = opts.metamask;
    }
    getConnectorInfoByClientId(clientId) {
        // const connectorKey = Object.keys(this.connectors).find(
        //   (key) => this.connectors[key]?.connector?.clientId === clientId
        // );
        // if (!connectorKey) {
        //   return;
        // }
        // const [brandName, address] = connectorKey.split('-');
        // const account = this.accounts.find(
        //   (acc) =>
        //     acc.address.toLowerCase() === address.toLowerCase() &&
        //     acc.brandName === brandName
        // )!;
        // return {
        //   brandName,
        //   address,
        //   connectorKey,
        //   account
        // };
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
                value: (0, utils_1.convertToBigint)(transaction.value),
                data: (0, utils_1.bufferToHex)(transaction.data),
                nonce: (0, utils_1.convertToBigint)(transaction.nonce),
                gasLimit: (0, utils_1.convertToBigint)(transaction.gasLimit),
                gasPrice: typeof transaction.gasPrice !== 'undefined'
                    ? (0, utils_1.convertToBigint)(transaction.gasPrice)
                    : (0, utils_1.convertToBigint)(transaction.maxFeePerGas)
            };
            const txChainId = (0, utils_1.getChainId)(transaction.common);
            this.onAfterConnect = (error, payload) => __awaiter(this, void 0, void 0, function* () {
                if (error) {
                    this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, account, error);
                    return;
                }
                if (!this.currentConnector)
                    throw new Error('No connector avaliable');
                this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.CONNECTED, account, payload);
                if (payload) {
                    const { accounts, chainId } = payload.params[0];
                    if (accounts[0].toLowerCase() !== address.toLowerCase() ||
                        chainId !== txChainId) {
                        this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, account, {
                            message: 'Wrong address or chainId',
                            code: accounts[0].toLowerCase() === address.toLowerCase() ? 1000 : 1001
                        });
                        return;
                    }
                    this.currentConnector.chainId = chainId;
                }
                try {
                    const result = yield this.currentConnector.connector
                        .getProvider()
                        .request({
                        method: 'eth_sendTransaction',
                        params: [
                            {
                                data: this._normalize(txData.data),
                                from: address,
                                gas: this._normalize(txData.gasLimit),
                                gasPrice: this._normalize(txData.gasPrice),
                                nonce: this._normalize(txData.nonce),
                                to: this._normalize(txData.to),
                                value: this._normalize(txData.value) || '0x0' // prevent 0x
                            }
                        ]
                    });
                    this.resolvePromise(result);
                    this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.SIBMITTED, account, result);
                }
                catch (e) {
                    this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.REJECTED, account, e);
                }
            });
            this.onDisconnect = (error, payload) => {
                if (!this.currentConnector)
                    throw new Error('No connector avaliable');
                this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, error || payload.params[0]);
                this._closeConnector(this.currentConnector.connector, address, brandName);
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
                    this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, account, error);
                    return;
                }
                if (!this.currentConnector)
                    throw new Error('No connector avaliable');
                const { accounts } = payload.params[0];
                if (payload) {
                    if (accounts[0].toLowerCase() !== address.toLowerCase()) {
                        this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, account, {
                            message: 'Wrong address or chainId',
                            code: accounts[0].toLowerCase() === address.toLowerCase() ? 1000 : 1001
                        });
                        return;
                    }
                }
                try {
                    this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.CONNECTED, payload);
                    const result = yield this.currentConnector.connector
                        .getProvider()
                        .request({
                        method: 'personal_sign',
                        params: [message, address]
                    });
                    this.resolvePromise(result);
                    this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.SIBMITTED, account, result);
                }
                catch (e) {
                    this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.REJECTED, account, e);
                }
            });
            this.onDisconnect = (error, payload) => {
                if (!this.currentConnector)
                    throw new Error('No connector avaliable');
                this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, error || payload.params[0]);
                this._closeConnector(this.currentConnector.connector, address, brandName);
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
                    this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, account, error);
                    return;
                }
                if (!this.currentConnector)
                    throw new Error('No connector avaliable');
                if (payload) {
                    const { accounts } = payload.params[0];
                    if (accounts[0].toLowerCase() !== address.toLowerCase()) {
                        this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, account, {
                            message: 'Wrong address or chainId',
                            code: accounts[0].toLowerCase() === address.toLowerCase() ? 1000 : 1001
                        });
                        return;
                    }
                }
                try {
                    this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.CONNECTED, account, payload);
                    const result = yield this.currentConnector.connector
                        .getProvider()
                        .request({
                        method: 'eth_signTypedData',
                        params: [
                            address,
                            typeof data === 'string' ? data : JSON.stringify(data)
                        ]
                    });
                    this.resolvePromise(result);
                    this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.SIBMITTED, account, result);
                }
                catch (e) {
                    this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.REJECTED, account, e);
                }
            });
            this.onDisconnect = (error, payload) => {
                if (!this.currentConnector)
                    throw new Error('No connector avaliable');
                this.updateCurrentStatus(type_1.WALLETCONNECT_STATUS_MAP.FAILD, account, error || payload.params[0]);
                this._closeConnector(this.currentConnector.connector, address, brandName);
            };
            yield this.init(account.address, account.brandName);
            return new Promise((resolve) => {
                this.resolvePromise = resolve;
            });
        });
    }
    _close(address, brandName, silent) {
        const connector = this.connectors[`${brandName}-${address.toLowerCase()}`];
        if (connector) {
            this._closeConnector(connector.connector, address, brandName, silent);
        }
    }
    updateCurrentStatus(status, account, payload) {
        var _a;
        if ((status === type_1.WALLETCONNECT_STATUS_MAP.REJECTED ||
            status === type_1.WALLETCONNECT_STATUS_MAP.FAILD) &&
            (this.currentConnectStatus === type_1.WALLETCONNECT_STATUS_MAP.FAILD ||
                this.currentConnectStatus === type_1.WALLETCONNECT_STATUS_MAP.REJECTED ||
                this.currentConnectStatus === type_1.WALLETCONNECT_STATUS_MAP.SIBMITTED)) {
            return;
        }
        this.currentConnectStatus = status;
        const connector = this.connectors[`${account === null || account === void 0 ? void 0 : account.brandName}-${(_a = account === null || account === void 0 ? void 0 : account.address) === null || _a === void 0 ? void 0 : _a.toLowerCase()}`];
        if (connector) {
            connector.status = status;
        }
        this.emit('statusChange', {
            status,
            account: account || {
                address: payload === null || payload === void 0 ? void 0 : payload.account
            },
            payload: Object.assign(Object.assign({}, payload), { peer: {
                    metadata: payload === null || payload === void 0 ? void 0 : payload.peerMeta
                } })
        });
    }
    _normalize(str) {
        return (0, helper_1.sanitizeHex)(str);
    }
    _checkBrandName(brandName, payload) {
        var _a, _b;
        const name = (_a = payload.params[0].peerMeta) === null || _a === void 0 ? void 0 : _a.name;
        // just check if brandName is in name or name is in brandName
        let lowerName = name === null || name === void 0 ? void 0 : name.toLowerCase();
        if (!lowerName) {
            this.emit('error', new Error('[WalletConnect] No peerMeta name ' +
                JSON.stringify(payload.params[0].peerMeta)));
            lowerName = brandName;
        }
        const peerName = (_b = type_1.BuildInWalletPeerName[brandName]) === null || _b === void 0 ? void 0 : _b.toLowerCase();
        if (type_1.IGNORE_CHECK_WALLET.includes(brandName))
            return true;
        if ((peerName === null || peerName === void 0 ? void 0 : peerName.includes(lowerName)) || (lowerName === null || lowerName === void 0 ? void 0 : lowerName.includes(peerName !== null && peerName !== void 0 ? peerName : ''))) {
            return true;
        }
        return false;
    }
}
exports.MetaMaskSDK = MetaMaskSDK;
