import { isDefined } from 'twenty-shared/utils';

import {
  frontComponentHostCommunicationApi,
  type GetCurrentPositionFunction,
} from '../globals/frontComponentHostCommunicationApi';

export const getCurrentPosition: GetCurrentPositionFunction = () => {
  const getCurrentPositionFunction =
    frontComponentHostCommunicationApi.getCurrentPosition;

  if (!isDefined(getCurrentPositionFunction)) {
    throw new Error('getCurrentPositionFunction is not set');
  }

  return getCurrentPositionFunction();
};
