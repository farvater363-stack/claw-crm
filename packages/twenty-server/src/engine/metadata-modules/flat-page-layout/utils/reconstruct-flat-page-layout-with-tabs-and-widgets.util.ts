import { isDefined } from 'twenty-shared/utils';

import { type FlatPageLayoutTabMaps } from 'src/engine/metadata-modules/flat-page-layout-tab/types/flat-page-layout-tab-maps.type';
import { type FlatPageLayoutTab } from 'src/engine/metadata-modules/flat-page-layout-tab/types/flat-page-layout-tab.type';
import { type FlatPageLayoutWidgetMaps } from 'src/engine/metadata-modules/flat-page-layout-widget/types/flat-page-layout-widget-maps.type';
import { type FlatPageLayoutWidget } from 'src/engine/metadata-modules/flat-page-layout-widget/types/flat-page-layout-widget.type';
import { type FlatPageLayout } from 'src/engine/metadata-modules/flat-page-layout/types/flat-page-layout.type';
import { resolveEffectiveFlatEntityProperty } from 'src/engine/metadata-modules/overrides/utils/resolve-effective-flat-entity-property.util';

export type FlatPageLayoutTabWithWidgets = FlatPageLayoutTab & {
  widgets: FlatPageLayoutWidget[];
};

export type FlatPageLayoutWithTabsAndWidgets = FlatPageLayout & {
  tabs: FlatPageLayoutTabWithWidgets[];
};

const getResolvedPageLayoutTabId = (widget: FlatPageLayoutWidget): string =>
  resolveEffectiveFlatEntityProperty({
    metadataName: 'pageLayoutWidget',
    flatEntity: widget,
    property: 'pageLayoutTabId',
  });

const groupBy = <TItem>(
  items: TItem[],
  getKey: (item: TItem) => string,
): Map<string, TItem[]> => {
  const groups = new Map<string, TItem[]>();

  for (const item of items) {
    const key = getKey(item);
    const group = groups.get(key);

    if (isDefined(group)) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
};

// Groups tabs and widgets once, so reconstructing every layout of a workspace
// stays linear instead of scanning all tabs and widgets per layout.
export const buildFlatPageLayoutWithTabsAndWidgetsReconstructor = ({
  flatPageLayoutTabMaps,
  flatPageLayoutWidgetMaps,
}: {
  flatPageLayoutTabMaps: FlatPageLayoutTabMaps;
  flatPageLayoutWidgetMaps: FlatPageLayoutWidgetMaps;
}): ((layout: FlatPageLayout) => FlatPageLayoutWithTabsAndWidgets) => {
  const tabsByPageLayoutId = groupBy(
    Object.values(flatPageLayoutTabMaps.byUniversalIdentifier)
      .filter(isDefined)
      .filter((tab) => !isDefined(tab.deletedAt))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    (tab) => tab.pageLayoutId,
  );

  const widgetsByPageLayoutTabId = groupBy(
    Object.values(flatPageLayoutWidgetMaps.byUniversalIdentifier)
      .filter(isDefined)
      .filter((widget) => !isDefined(widget.deletedAt)),
    getResolvedPageLayoutTabId,
  );

  return (layout) => {
    const tabsWithWidgets: FlatPageLayoutTabWithWidgets[] = (
      tabsByPageLayoutId.get(layout.id) ?? []
    ).map((tab) => {
      const widgets = widgetsByPageLayoutTabId.get(tab.id) ?? [];

      return {
        ...tab,
        widgets,
        widgetIds: widgets.map((widget) => widget.id),
      };
    });

    return {
      ...layout,
      tabs: tabsWithWidgets,
      tabIds: tabsWithWidgets.map((tab) => tab.id),
    };
  };
};

export const reconstructFlatPageLayoutWithTabsAndWidgets = ({
  layout,
  flatPageLayoutTabMaps,
  flatPageLayoutWidgetMaps,
}: {
  layout: FlatPageLayout;
  flatPageLayoutTabMaps: FlatPageLayoutTabMaps;
  flatPageLayoutWidgetMaps: FlatPageLayoutWidgetMaps;
}): FlatPageLayoutWithTabsAndWidgets =>
  buildFlatPageLayoutWithTabsAndWidgetsReconstructor({
    flatPageLayoutTabMaps,
    flatPageLayoutWidgetMaps,
  })(layout);
