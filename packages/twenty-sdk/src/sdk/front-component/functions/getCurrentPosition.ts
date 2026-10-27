import { isDefined } from 'twenty-shared/utils';

import {
  frontComponentHostCommunicationApi,
  type GetCurrentPositionFunction,
} from '../globals/frontComponentHostCommunicationApi';

export const getCurrentPosition: GetCurrentPositionFunction = () => {
  const getCurrentPositionFunction =
    frontComponentHostCommunicationApi.getCurrentPosition;

  // Resolve like the host does, so callers handle one shape on old hosts too.
  if (!isDefined(getCurrentPositionFunction)) {
    return Promise.resolve({ status: 'failed', reason: 'unsupported' });
  }

  return getCurrentPositionFunction();
};
