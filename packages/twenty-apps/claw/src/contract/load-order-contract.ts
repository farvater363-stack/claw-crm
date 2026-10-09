import { CoreApiClient } from 'twenty-client-sdk/core';

import { type StoredOrderForContract } from 'src/contract/contract-data';
import { fromCurrency } from 'src/recalc/money';
import { toNumber } from 'src/recalc/load-recalc-input';

const PAGE_SIZE = 200;
const MONEY = { amountMicros: true } as const;

export type SignedContractRecord = {
  id: string;
  signedAt: string | null;
  clientName: string | null;
  clientPhone: string | null;
  pdfUrl: string | null;
  pdfLabel: string | null;
  termsKey: string | null;
  templateVersion: number | null;
  checkCode: string | null;
  signedBy: string | null;
  device: string | null;
  total: number | null;
};

export type OrderContract = {
  order: StoredOrderForContract;
  // Newest first; the first one is in force
  signings: SignedContractRecord[];
};

export const loadOrderContract = async (
  orderId: string,
): Promise<OrderContract | null> => {
  const { orders, orderItems, orderExtraServices, signedContracts } =
    await new CoreApiClient().query({
      orders: {
        __args: { filter: { id: { eq: orderId } }, first: 1 },
        edges: {
          node: {
            name: true,
            clientFullName: { firstName: true, lastName: true },
            clientPhone: true,
            district: true,
            addressLine: true,
            floor: true,
            subtotal: MONEY,
            discount: MONEY,
            total: MONEY,
            paid: MONEY,
            installationDeadline: true,
            paintColor: true,
          },
        },
      },
      orderItems: {
        __args: {
          filter: { orderId: { eq: orderId } },
          first: PAGE_SIZE,
          orderBy: [{ createdAt: 'AscNullsLast' }],
        },
        edges: {
          node: {
            id: true,
            widthCm: true,
            heightCm: true,
            projectionCm: true,
            projectionKind: true,
            quantity: true,
            designId: true,
            design: { name: true },
            lineTotal: MONEY,
          },
        },
      },
      orderExtraServices: {
        __args: {
          filter: { orderId: { eq: orderId } },
          first: PAGE_SIZE,
          orderBy: [{ createdAt: 'AscNullsLast' }],
        },
        edges: {
          node: {
            name: true,
            quantity: true,
            orderItemId: true,
            extraService: { name: true },
            lineTotal: MONEY,
          },
        },
      },
      signedContracts: {
        __args: {
          filter: { orderId: { eq: orderId } },
          first: PAGE_SIZE,
          orderBy: [{ signedAt: 'DescNullsLast' }],
        },
        edges: {
          node: {
            id: true,
            signedAt: true,
            clientName: true,
            clientPhone: true,
            pdf: { url: true, label: true },
            termsKey: true,
            templateVersion: true,
            checkCode: true,
            signedBy: true,
            device: true,
            total: MONEY,
          },
        },
      },
    });
  const order = orders?.edges[0]?.node;

  if (order === undefined || order === null) return null;

  return {
    order: {
      name: order.name ?? null,
      clientFullName: order.clientFullName,
      clientPhone: order.clientPhone ?? null,
      district: order.district ?? null,
      addressLine: order.addressLine ?? null,
      floor: toNumber(order.floor),
      subtotal: fromCurrency(order.subtotal),
      discount: fromCurrency(order.discount),
      total: fromCurrency(order.total),
      paid: fromCurrency(order.paid),
      installationDeadline: order.installationDeadline ?? null,
      paintColor: order.paintColor ?? null,
      items: (orderItems?.edges ?? []).map(({ node }) => ({
        id: node.id,
        widthCm: toNumber(node.widthCm),
        heightCm: toNumber(node.heightCm),
        projectionCm: toNumber(node.projectionCm),
        projectionKind: node.projectionKind ?? null,
        quantity: toNumber(node.quantity),
        designId: node.designId ?? null,
        designName: node.design?.name ?? null,
        lineTotal: fromCurrency(node.lineTotal),
      })),
      extraServices: (orderExtraServices?.edges ?? []).map(({ node }) => ({
        name: node.name ?? null,
        serviceName: node.extraService?.name ?? null,
        quantity: toNumber(node.quantity),
        orderItemId: node.orderItemId ?? null,
        lineTotal: fromCurrency(node.lineTotal),
      })),
    },
    signings: (signedContracts?.edges ?? []).map(({ node }) => ({
      id: node.id,
      signedAt: node.signedAt ?? null,
      clientName: node.clientName ?? null,
      clientPhone: node.clientPhone ?? null,
      pdfUrl: node.pdf?.[0]?.url ?? null,
      pdfLabel: node.pdf?.[0]?.label ?? null,
      termsKey: node.termsKey ?? null,
      templateVersion: toNumber(node.templateVersion),
      checkCode: node.checkCode ?? null,
      signedBy: node.signedBy ?? null,
      device: node.device ?? null,
      total: fromCurrency(node.total),
    })),
  };
};
