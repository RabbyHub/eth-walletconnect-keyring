"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IGNORE_CHECK_WALLET = exports.buildInWallets = exports.BuildInWalletPeerName = exports.COMMON_WALLETCONNECT = exports.WALLETCONNECT_SESSION_STATUS_MAP = exports.WALLETCONNECT_STATUS_MAP = void 0;
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
exports.COMMON_WALLETCONNECT = ['WALLETCONNECT', 'WalletConnect'];
exports.BuildInWalletPeerName = {
    MetaMask: 'MetaMask',
    TP: 'TokenPocket',
    TRUSTWALLET: 'Trust Wallet',
    MATHWALLET: 'MathWallet',
    IMTOKEN: 'imToken',
    Rainbow: 'Rainbow',
    Bitkeep: 'Bitget',
    Uniswap: 'Uniswap',
    Zerion: 'Zerion'
};
exports.buildInWallets = Object.keys(exports.BuildInWalletPeerName);
exports.IGNORE_CHECK_WALLET = ['FIREBLOCKS', 'JADE', 'AMBER', 'COBO'];
