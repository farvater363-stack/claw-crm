import { CoreApiClient } from 'twenty-client-sdk/core';

// A run triggered by a person defaults to that person's access; the recalc
// reads and writes admin-only fields (cost, margin, pay), so it must act as
// the application or every order a measurer or manager saves stays unpriced.
export const createRecalcClient = () =>
  new CoreApiClient({ runAs: 'application' });
