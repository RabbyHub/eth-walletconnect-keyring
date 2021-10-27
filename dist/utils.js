"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wait = void 0;
const wait = (fn, ms = 1000) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            fn();
            resolve(true);
        }, ms);
    });
};
exports.wait = wait;
