"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChainId = exports.convertToBigint = exports.isBrowser = exports.wait = void 0;
const wait = (fn, ms = 1000) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            fn();
            resolve(true);
        }, ms);
    });
};
exports.wait = wait;
const isBrowser = () => typeof window !== 'undefined';
exports.isBrowser = isBrowser;
const convertToBigint = (value) => {
    console.log('value', value, typeof value);
    return typeof value === 'bigint'
        ? `0x${value.toString(16)}`
        : `0x${value.toString('hex')}`;
};
exports.convertToBigint = convertToBigint;
const getChainId = (common) => {
    if (typeof common.chainIdBN !== 'undefined') {
        return common.chainIdBN().toNumber();
    }
    else {
        return parseInt(common.chainId());
    }
};
exports.getChainId = getChainId;
