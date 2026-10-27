import { type FlatPageLayoutTabMaps } from 'src/engine/metadata-modules/flat-page-layout-tab/types/flat-page-layout-tab-maps.type';
import { type FlatPageLayoutWidgetMaps } from 'src/engine/metadata-modules/flat-page-layout-widget/types/flat-page-layout-widget-maps.type';
import { type FlatPageLayout } from 'src/engine/metadata-modules/flat-page-layout/types/flat-page-layout.type';
import {
  buildFlatPageLayoutWithTabsAndWidgetsReconstructor,
  reconstructFlatPageLayoutWithTabsAndWidgets,
} from 'src/engine/metadata-modules/flat-page-layout/utils/reconstruct-flat-page-layout-with-tabs-and-widgets.util';

const mapsOf = <TMaps>(entities: { universalIdentifier: string }[]): TMaps =>
  ({
    byUniversalIdentifier: Object.fromEntries(
      entities.map((entity) => [entity.universalIdentifier, entity]),
    ),
  }) as unknown as TMaps;

const tab = (
  id: string,
  pageLayoutId: string,
  position: number,
  deleted = false,
) => ({
  id,
  universalIdentifier: `tab-${id}`,
  applicationUniversalIdentifier: 'app',
  pageLayoutId,
  position,
  deletedAt: deleted ? '2026-01-01' : null,
});

const widget = (
  id: string,
  pageLayoutTabId: string,
  {
    deleted = false,
    overrides,
  }: { deleted?: boolean; overrides?: object } = {},
) => ({
  id,
  universalIdentifier: `widget-${id}`,
  applicationUniversalIdentifier: 'app',
  pageLayoutTabId,
  overrides,
  deletedAt: deleted ? '2026-01-01' : null,
});

const layout = (id: string) => ({ id }) as unknown as FlatPageLayout;

const flatPageLayoutTabMaps = mapsOf<FlatPageLayoutTabMaps>([
  tab('b2', 'b', 0),
  tab('a2', 'a', 2),
  tab('a1', 'a', 1),
  tab('a-deleted', 'a', 0, true),
]);

const flatPageLayoutWidgetMaps = mapsOf<FlatPageLayoutWidgetMaps>([
  widget('w1', 'a1'),
  widget('w2', 'a2'),
  widget('w3', 'a1'),
  widget('w-deleted', 'a1', { deleted: true }),
  widget('w-moved', 'a1', { overrides: { pageLayoutTabId: 'a2' } }),
  widget('w4', 'b2'),
]);

describe('reconstructFlatPageLayoutWithTabsAndWidgets', () => {
  it('gives each layout its live tabs by position, each with its live widgets', () => {
    const reconstructLayout =
      buildFlatPageLayoutWithTabsAndWidgetsReconstructor({
        flatPageLayoutTabMaps,
        flatPageLayoutWidgetMaps,
      });

    const layoutA = reconstructLayout(layout('a'));

    expect(layoutA.tabIds).toEqual(['a1', 'a2']);
    expect(layoutA.tabs.map((tab) => tab.widgetIds)).toEqual([
      ['w1', 'w3'],
      ['w2', 'w-moved'],
    ]);
    expect(reconstructLayout(layout('b')).tabs[0].widgetIds).toEqual(['w4']);
    expect(reconstructLayout(layout('c')).tabs).toEqual([]);
  });

  it('matches the single-layout form', () => {
    expect(
      reconstructFlatPageLayoutWithTabsAndWidgets({
        layout: layout('a'),
        flatPageLayoutTabMaps,
        flatPageLayoutWidgetMaps,
      }),
    ).toEqual(
      buildFlatPageLayoutWithTabsAndWidgetsReconstructor({
        flatPageLayoutTabMaps,
        flatPageLayoutWidgetMaps,
      })(layout('a')),
    );
  });
});
