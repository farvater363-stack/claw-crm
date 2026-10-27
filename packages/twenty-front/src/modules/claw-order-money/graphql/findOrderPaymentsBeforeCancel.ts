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
          amount {
            amountMicros
          }
        }
      }
    }
  }
`;
