type Page<TNode> =
  | {
      edges?: { node: TNode }[];
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    }
  | undefined;

export const PAGE_INFO = { hasNextPage: true, endCursor: true } as const;

export const fetchAllPages = async <TNode>(
  fetchPage: (after: string | undefined) => Promise<Page<TNode>>,
): Promise<TNode[]> => {
  const nodes: TNode[] = [];
  let after: string | undefined;

  for (;;) {
    const page = await fetchPage(after);

    nodes.push(...(page?.edges ?? []).map(({ node }) => node));

    const endCursor = page?.pageInfo?.endCursor;

    if (!page?.pageInfo?.hasNextPage || !endCursor) return nodes;

    after = endCursor;
  }
};
