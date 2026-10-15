import { styled } from '@linaria/react';
import { Trans } from '@lingui/react/macro';

import { useWorkspaceBypass } from '@/auth/sign-in-up/hooks/useWorkspaceBypass';
import { useIsCurrentLocationOnAWorkspace } from '@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledLinksContainer = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  justify-content: center;

  & > button {
    background: none;
    border: none;
    color: ${themeCssVariables.font.color.tertiary};
    cursor: pointer;
    font: inherit;
    padding: 0;

    &:hover {
      text-decoration: underline;
    }
  }
`;

export const FooterNote = () => {
  const { isOnAWorkspace } = useIsCurrentLocationOnAWorkspace();

  const { shouldOfferBypass, shouldUseBypass, enableBypass } =
    useWorkspaceBypass();

  if (!isOnAWorkspace || !shouldOfferBypass || shouldUseBypass) {
    return null;
  }

  return (
    <StyledLinksContainer>
      <button type="button" onClick={enableBypass}>
        <Trans>Bypass SSO</Trans>
      </button>
    </StyledLinksContainer>
  );
};
