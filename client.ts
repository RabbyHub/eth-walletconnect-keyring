import SignClient from '@walletconnect/sign-client';
import { CoreTypes } from '@walletconnect/types';
import { getRequiredNamespaces } from './helper';

export const initClient = async ({
  clientMeta,
  projectId,
  chainId
}: {
  clientMeta: CoreTypes.Metadata;
  projectId: string;
  chainId?: number;
}) => {
  const client = await SignClient.init({
    projectId,
    metadata: clientMeta
  });

  const requiredNamespaces = getRequiredNamespaces(
    chainId ? [`eip155:${chainId}`] : undefined
  );

  const result = await client.connect({
    requiredNamespaces
  });

  return {
    client,
    ...result
  };
};
