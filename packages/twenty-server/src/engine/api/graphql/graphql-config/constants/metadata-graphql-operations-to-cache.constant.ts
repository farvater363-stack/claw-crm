import { type CachedOperationConfig } from 'src/engine/api/graphql/graphql-config/hooks/use-cached-metadata';
import { FIND_ALL_VIEWS_GRAPHQL_OPERATION } from 'src/engine/metadata-modules/view/constants/find-all-views-graphql-operation.constant';

const VIEWS_OPERATION_CONFIG: CachedOperationConfig = {
  scope: 'userWorkspace',
  dependencies: [
    'flatViewMaps',
    'flatViewFieldMaps',
    'flatViewFieldGroupMaps',
    'flatViewFilterMaps',
    'flatViewFilterGroupMaps',
    'flatViewSortMaps',
    'flatViewGroupMaps',
    'flatObjectMetadataMaps',
    'flatApplicationMaps',
  ],
};

const PAGE_LAYOUTS_OPERATION_CONFIG: CachedOperationConfig = {
  scope: 'workspace',
  dependencies: [
    'flatPageLayoutMaps',
    'flatPageLayoutTabMaps',
    'flatPageLayoutWidgetMaps',
    'flatObjectMetadataMaps',
    'flatApplicationMaps',
  ],
};

export const METADATA_GRAPHQL_OPERATIONS_TO_CACHE: Record<
  string,
  CachedOperationConfig
> = {
  ObjectMetadataItems: {
    scope: 'workspace',
    dependencies: [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
      'flatIndexMaps',
      'flatSearchFieldMetadataMaps',
      'flatApplicationMaps',
    ],
  },
  [FIND_ALL_VIEWS_GRAPHQL_OPERATION]: VIEWS_OPERATION_CONFIG,
  // The front loads these on every page load; they resolve from the same
  // cached maps as their siblings above, so they key on the same hashes
  FindFieldsWidgetViews: VIEWS_OPERATION_CONFIG,
  FindTableWidgetViews: VIEWS_OPERATION_CONFIG,
  FindAllRecordPageLayouts: PAGE_LAYOUTS_OPERATION_CONFIG,
  FindAllRecordFormPageLayouts: PAGE_LAYOUTS_OPERATION_CONFIG,
};
