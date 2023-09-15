"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkBrandName = exports.getBuildInBrandName = exports.sanitizeHex = exports.getRequiredNamespaces = exports.getSupportedEventsByNamespace = exports.getSupportedMethodsByNamespace = exports.DEFAULT_EIP_155_EVENTS = exports.DEFAULT_EIP155_METHODS = exports.parseNamespaces = exports.getNamespacesFromChains = void 0;
const type_1 = require("./type");
const DEFAULT_MAIN_CHAINS = [
    'eip155:1',
    'eip155:10',
    'eip155:100',
    'eip155:137',
    'eip155:42161',
    'eip155:42220'
];
const getNamespacesFromChains = (chains) => {
    const supportedNamespaces = [];
    chains.forEach((chainId) => {
        const [namespace] = chainId.split(':');
        if (!supportedNamespaces.includes(namespace)) {
            supportedNamespaces.push(namespace);
        }
    });
    return supportedNamespaces;
};
exports.getNamespacesFromChains = getNamespacesFromChains;
const parseNamespaces = (namespaces) => {
    const allNamespaceAccounts = Object.values(namespaces)
        .map((namespace) => namespace.accounts)
        .flat();
    const accounts = allNamespaceAccounts.map((account) => {
        const [namespace, chainId, address] = account.split(':');
        return { address, chainId: Number(chainId), namespace };
    });
    return accounts;
};
exports.parseNamespaces = parseNamespaces;
/**
 * EIP155
 */
var DEFAULT_EIP155_METHODS;
(function (DEFAULT_EIP155_METHODS) {
    DEFAULT_EIP155_METHODS["ETH_SEND_TRANSACTION"] = "eth_sendTransaction";
    DEFAULT_EIP155_METHODS["ETH_SIGN_TRANSACTION"] = "eth_signTransaction";
    DEFAULT_EIP155_METHODS["PERSONAL_SIGN"] = "personal_sign";
    DEFAULT_EIP155_METHODS["ETH_SIGN_TYPED_DATA"] = "eth_signTypedData";
})(DEFAULT_EIP155_METHODS = exports.DEFAULT_EIP155_METHODS || (exports.DEFAULT_EIP155_METHODS = {}));
var DEFAULT_EIP_155_EVENTS;
(function (DEFAULT_EIP_155_EVENTS) {
    DEFAULT_EIP_155_EVENTS["ETH_CHAIN_CHANGED"] = "chainChanged";
    DEFAULT_EIP_155_EVENTS["ETH_ACCOUNTS_CHANGED"] = "accountsChanged";
})(DEFAULT_EIP_155_EVENTS = exports.DEFAULT_EIP_155_EVENTS || (exports.DEFAULT_EIP_155_EVENTS = {}));
const getSupportedMethodsByNamespace = (namespace) => {
    switch (namespace) {
        case 'eip155':
            return Object.values(DEFAULT_EIP155_METHODS);
        default:
            throw new Error(`No default methods for namespace: ${namespace}`);
    }
};
exports.getSupportedMethodsByNamespace = getSupportedMethodsByNamespace;
const getSupportedEventsByNamespace = (namespace) => {
    switch (namespace) {
        case 'eip155':
            return Object.values(DEFAULT_EIP_155_EVENTS);
        default:
            throw new Error(`No default events for namespace: ${namespace}`);
    }
};
exports.getSupportedEventsByNamespace = getSupportedEventsByNamespace;
const getRequiredNamespaces = (chains = DEFAULT_MAIN_CHAINS) => {
    const selectedNamespaces = (0, exports.getNamespacesFromChains)(chains);
    return Object.fromEntries(selectedNamespaces.map((namespace) => [
        namespace,
        {
            methods: (0, exports.getSupportedMethodsByNamespace)(namespace),
            chains: chains.filter((chain) => chain.startsWith(namespace)),
            events: (0, exports.getSupportedEventsByNamespace)(namespace)
        }
    ]));
};
exports.getRequiredNamespaces = getRequiredNamespaces;
function sanitizeHex(hex) {
    if (!hex)
        return;
    hex = hex.substring(0, 2) === '0x' ? hex.substring(2) : hex;
    if (hex === '') {
        return '';
    }
    hex = hex.length % 2 !== 0 ? '0' + hex : hex;
    return '0x' + hex;
}
exports.sanitizeHex = sanitizeHex;
function getBuildInBrandName(brandName, realBrandName, patchCheckWalletConnect) {
    if (patchCheckWalletConnect) {
        // is desktop
        if (brandName === 'WalletConnect')
            return brandName;
    }
    if (!type_1.COMMON_WALLETCONNECT.includes(brandName)) {
        return brandName;
    }
    const lowerName = realBrandName === null || realBrandName === void 0 ? void 0 : realBrandName.toLowerCase();
    if (!lowerName)
        return brandName;
    let buildIn = type_1.buildInWallets.find((item) => {
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
exports.getBuildInBrandName = getBuildInBrandName;
function checkBrandName(brandName, metaDataName) {
    var _a;
    // just check if brandName is in name or name is in brandName
    let lowerName = metaDataName === null || metaDataName === void 0 ? void 0 : metaDataName.toLowerCase();
    if (!lowerName) {
        lowerName = brandName;
    }
    const peerName = (_a = type_1.BuildInWalletPeerName[brandName]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    if (type_1.IGNORE_CHECK_WALLET.includes(brandName))
        return true;
    if ((peerName === null || peerName === void 0 ? void 0 : peerName.includes(lowerName)) || (lowerName === null || lowerName === void 0 ? void 0 : lowerName.includes(peerName !== null && peerName !== void 0 ? peerName : ''))) {
        return true;
    }
    return false;
}
exports.checkBrandName = checkBrandName;
