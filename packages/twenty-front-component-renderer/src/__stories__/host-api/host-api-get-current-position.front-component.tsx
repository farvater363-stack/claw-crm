import { useState } from 'react';
import { defineFrontComponent } from 'twenty-sdk/define';
import { getCurrentPosition } from 'twenty-sdk/front-component';

import { FrontComponentCard } from '@/__stories__/shared/front-components/front-component-card';
import {
  BUTTON_STYLE,
  STATUS_STYLE,
} from '@/__stories__/shared/front-components/styles';

const HostApiGetCurrentPositionFrontComponent = () => {
  const [status, setStatus] = useState('idle');

  const handleClick = async () => {
    try {
      const result = await getCurrentPosition();

      setStatus(
        result.status === 'located'
          ? `geolocation:located:${result.lat},${result.lng}`
          : `geolocation:failed:${result.reason}`,
      );
    } catch (error) {
      setStatus(
        `geolocation:error:${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return (
    <FrontComponentCard title="host-api:get-current-position">
      <button
        data-testid="subject"
        type="button"
        onClick={handleClick}
        style={BUTTON_STYLE}
      >
        Locate
      </button>
      <span data-testid="api-status" style={STATUS_STYLE}>
        {status}
      </span>
    </FrontComponentCard>
  );
};

export default defineFrontComponent({
  universalIdentifier:
    'fc-host-geolocation-00000000-0000-0000-0000-000000000020',
  name: 'host-api-get-current-position-front-component',
  description: 'Front component covering getCurrentPosition host API',
  component: HostApiGetCurrentPositionFrontComponent,
});
