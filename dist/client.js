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
exports.initClient = void 0;
const sign_client_1 = __importDefault(require("@walletconnect/sign-client"));
const helper_1 = require("./helper");
const initClient = ({ clientMeta, projectId, chainId }) => __awaiter(void 0, void 0, void 0, function* () {
    const client = yield sign_client_1.default.init({
        projectId,
        metadata: clientMeta
    });
    const requiredNamespaces = (0, helper_1.getRequiredNamespaces)(chainId ? [`eip155:${chainId}`] : undefined);
    const result = yield client.connect({
        requiredNamespaces
    });
    return Object.assign({ client }, result);
});
exports.initClient = initClient;
