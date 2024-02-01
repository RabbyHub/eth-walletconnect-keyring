export const wait = (fn: () => void, ms = 1000) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      fn();
      resolve(true);
    }, ms);
  });
};

export const isBrowser = () => typeof window !== 'undefined';

export const convertToBigint = (value: any) => {
  return typeof value === 'bigint'
    ? `0x${value.toString(16)}`
    : `0x${value.toString('hex')}`;
};

export const getChainId = (common) => {
  if (typeof common.chainIdBN !== 'undefined') {
    return common.chainIdBN().toNumber();
  } else {
    return parseInt(common.chainId());
  }
};

export const bufferToHex = (buffer: Buffer | ArrayBuffer) => {
  return `0x${Buffer.from(buffer).toString('hex')}`;
};
