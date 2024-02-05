"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkBrandName = exports.getBuildInBrandName = exports.sanitizeHex = exports.getRequiredNamespaces = exports.getNamespaces = exports.DEFAULT_EIP_155_EVENTS = exports.parseNamespaces = void 0;
const type_1 = require("./type");
const rpc_1 = require("./rpc");
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
var DEFAULT_EIP_155_EVENTS;
(function (DEFAULT_EIP_155_EVENTS) {
    DEFAULT_EIP_155_EVENTS["ETH_CHAIN_CHANGED"] = "chainChanged";
    DEFAULT_EIP_155_EVENTS["ETH_ACCOUNTS_CHANGED"] = "accountsChanged";
})(DEFAULT_EIP_155_EVENTS = exports.DEFAULT_EIP_155_EVENTS || (exports.DEFAULT_EIP_155_EVENTS = {}));
const getNamespaces = (chains) => {
    return {
        eip155: {
            methods: rpc_1.OPTIONAL_METHODS,
            chains: chains.map((chain) => `eip155:${chain}`),
            events: rpc_1.OPTIONAL_EVENTS
        }
    };
};
exports.getNamespaces = getNamespaces;
const getRequiredNamespaces = () => {
    return {
        eip155: {
            methods: rpc_1.REQUIRED_METHODS,
            chains: ['eip155:1'],
            events: rpc_1.REQUIRED_EVENTS
        }
    };
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
