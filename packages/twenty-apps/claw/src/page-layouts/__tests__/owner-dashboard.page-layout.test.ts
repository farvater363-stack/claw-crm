import { describe, expect, it } from 'vitest';

import { IDS } from 'src/constants/universal-identifiers';
import analytics from 'src/front-components/analytics.front-component';
import today from 'src/front-components/today.front-component';
import ownerDashboard from 'src/page-layouts/owner-dashboard.page-layout';

const tabs = [...(ownerDashboard.config.tabs ?? [])].sort(
  (left, right) => left.position - right.position,
);

describe('owner dashboard layout', () => {
  it('is a page of its own, so each screen takes the height it needs', () => {
    expect(ownerDashboard.config.type).toBe('STANDALONE_PAGE');
  });

  it('keeps its two tabs', () => {
    expect(tabs.map((tab) => [tab.title, tab.universalIdentifier])).toEqual([
      ['Сегодня', IDS.ownerDashboard.todayTab],
      ['Аналитика', IDS.ownerDashboard.pageLayoutTab],
    ]);
  });

  it('shows one screen of the app on each tab', () => {
    expect(
      tabs.map((tab) => ({
        layoutMode: tab.layoutMode,
        widgets: (tab.widgets ?? []).map((widget) => ({
          type: widget.type,
          layoutMode: widget.position?.layoutMode,
          frontComponent: (
            widget.configuration as {
              frontComponentUniversalIdentifier?: string;
            }
          ).frontComponentUniversalIdentifier,
        })),
      })),
    ).toEqual([
      {
        layoutMode: 'VERTICAL_LIST',
        widgets: [
          {
            type: 'FRONT_COMPONENT',
            layoutMode: 'VERTICAL_LIST',
            frontComponent: today.config.universalIdentifier,
          },
        ],
      },
      {
        layoutMode: 'VERTICAL_LIST',
        widgets: [
          {
            type: 'FRONT_COMPONENT',
            layoutMode: 'VERTICAL_LIST',
            frontComponent: analytics.config.universalIdentifier,
          },
        ],
      },
    ]);
  });
});
