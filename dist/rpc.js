"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REQUIRED_EVENTS = exports.REQUIRED_METHODS = exports.OPTIONAL_EVENTS = exports.OPTIONAL_METHODS = void 0;
exports.OPTIONAL_METHODS = [
    'eth_accounts',
    'eth_requestAccounts',
    'eth_sendRawTransaction',
    'eth_sign',
    'eth_signTransaction',
    'eth_signTypedData',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
    'eth_sendTransaction',
    'personal_sign',
    'wallet_switchEthereumChain',
    'wallet_addEthereumChain',
    'wallet_getPermissions',
    'wallet_requestPermissions',
    'wallet_registerOnboarding',
    'wallet_watchAsset',
    'wallet_scanQRCode'
];
exports.OPTIONAL_EVENTS = [
    'chainChanged',
    'accountsChanged',
    'message',
    'disconnect',
    'connect'
];
exports.REQUIRED_METHODS = ['eth_sendTransaction', 'personal_sign'];
exports.REQUIRED_EVENTS = ['chainChanged', 'accountsChanged'];
