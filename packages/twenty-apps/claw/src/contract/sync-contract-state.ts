import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type ContractState } from 'src/constants/select-options';
import { isContractChanged } from 'src/contract/contract-change';
import {
  contractDataFromOrder,
  type StoredOrderForContract,
} from 'src/contract/contract-data';
import { type ContractTerms } from 'src/contract/contract-document';
import { DEFAULT_CONTRACT_TEMPLATE } from 'src/contract/contract-template';
import { fromCurrency } from 'src/recalc/money';
import { toNumber } from 'src/recalc/load-recalc-input';

const PAGE_SIZE = 200;

// The state the order should show, or null when it is already right or there
// is no signed contract to compare with.
export const nextContractState = ({
  currentState,
  signedTermsKey,
  terms,
}: {
  currentState: string | null;
  // undefined: the order has no signed contract
  signedTermsKey: string | null | undefined;
  terms: ContractTerms;
}): ContractState | null => {
  if (signedTermsKey === undefined) return null;

  const state: ContractState = isContractChanged(signedTermsKey, terms)
    ? 'CHANGED'
    : 'SIGNED';

  return state === currentState ? null : state;
};

// Only what the terms key reads: names, prices of lines and the template's
// wording do not take part in it.
export const syncContractState = async (
  client: CoreApiClient,
  orderId: string,
): Promise<void> => {
  const byOrder = { orderId: { eq: orderId } };
  const { orders, orderItems, orderExtraServices, signedContracts } =
    await client.query({
      orders: {
        __args: { filter: { id: { eq: orderId } }, first: 1 },
        edges: {
          node: {
            contractState: true,
            total: { amountMicros: true },
            paintColor: true,
          },
        },
      },
      orderItems: {
        __args: { filter: byOrder, first: PAGE_SIZE },
        edges: {
          node: {
            id: true,
            product: true,
            shape: true,
            widthCm: true,
            heightCm: true,
            projectionCm: true,
            projectionKind: true,
            projectionSide: true,
            quantity: true,
            designId: true,
          },
        },
      },
      orderExtraServices: {
        __args: { filter: byOrder, first: PAGE_SIZE },
        edges: {
          node: { extraServiceId: true, quantity: true, orderItemId: true },
        },
      },
      signedContracts: {
        __args: {
          filter: byOrder,
          first: 1,
          orderBy: [{ signedAt: 'DescNullsLast' }],
        },
        edges: { node: { termsKey: true } },
      },
    });
  const order = orders?.edges[0]?.node;
  const signed = signedContracts?.edges[0]?.node;

  if (
    order === undefined ||
    order === null ||
    signed === undefined ||
    signed === null
  ) {
    return;
  }

  const stored: StoredOrderForContract = {
    name: null,
    clientFullName: null,
    clientPhone: null,
    district: null,
    addressLine: null,
    floor: null,
    subtotal: null,
    discount: null,
    total: fromCurrency(order.total),
    prepaid: null,
    installationDeadline: null,
    paintColor: order.paintColor ?? null,
    items: (orderItems?.edges ?? []).map(({ node }) => ({
      id: node.id,
      product: node.product ?? null,
      shape: node.shape ?? null,
      widthCm: toNumber(node.widthCm),
      heightCm: toNumber(node.heightCm),
      projectionCm: toNumber(node.projectionCm),
      projectionKind: node.projectionKind ?? null,
      projectionSide: node.projectionSide ?? null,
      quantity: toNumber(node.quantity),
      designId: node.designId ?? null,
      designName: null,
      lineTotal: null,
    })),
    extraServices: (orderExtraServices?.edges ?? []).map(({ node }) => ({
      extraServiceId: node.extraServiceId ?? null,
      name: null,
      serviceName: null,
      quantity: toNumber(node.quantity),
      orderItemId: node.orderItemId ?? null,
      lineTotal: null,
    })),
  };
  // The template and the day only set wording and «Срок», not the key.
  const terms = contractDataFromOrder(
    stored,
    DEFAULT_CONTRACT_TEMPLATE,
    '2000-01-01',
  );
  const state = nextContractState({
    currentState: order.contractState ?? null,
    signedTermsKey: signed.termsKey ?? null,
    terms,
  });

  if (state === null) return;

  await client.mutation({
    updateOrder: {
      __args: { id: orderId, data: { contractState: state } },
      id: true,
    },
  });
};
