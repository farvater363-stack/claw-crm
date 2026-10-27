import { gql } from '@apollo/client';

export const FIND_ORDER_PAYMENTS_BEFORE_CANCEL = gql`
  query FindOrderPaymentsBeforeCancel(
    $filter: OrderPaymentFilterInput
    $limit: Int
  ) {
    orderPayments(filter: $filter, first: $limit) {
      edges {
        node {
          id
          orderId
          method
          amount {
            amountMicros
          }
        }
      }
    }
  }
`;

export const FIND_ORDERS_PAID_BEFORE_CANCEL = gql`
  query FindOrdersPaidBeforeCancel($filter: OrderFilterInput, $limit: Int) {
    orders(filter: $filter, first: $limit) {
      edges {
        node {
          id
          paid {
            amountMicros
          }
        }
      }
    }
  }
`;
