import EventEmitter from 'events';
import { WALLETCONNECT_SESSION_STATUS_MAP } from './type';

export abstract class SDK extends EventEmitter {
  abstract closeConnector(
    params: {
      address: string;
      brandName: string;
    },
    silent?: boolean
  );

  abstract updateSessionStatus(
    status: keyof typeof WALLETCONNECT_SESSION_STATUS_MAP,
    opt?: {
      address: string;
      brandName: string;
      realBrandName?: string;
    }
  );

  abstract switchEthereumChain(chainId: number): Promise<unknown>;
}
