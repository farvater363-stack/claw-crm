import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewFilterGroupLogicalOperator,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { VIEW_PART_IDS } from 'src/constants/view-part-identifiers';
import { toKeyedViewFields } from 'src/utils/to-view-fields';

const { person } = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS;
const ids = VIEW_PART_IDS.dashboardCallBacks;

// Due today or missed: a call put off yesterday is still owed.
export default defineView({
  universalIdentifier: IDS.view.dashboardCallBacks,
  name: 'Перезвонить',
  objectUniversalIdentifier: person.universalIdentifier,
  type: ViewType.TABLE_WIDGET,
  fields: toKeyedViewFields([
    {
      field: person.fields.name.universalIdentifier,
      viewField: ids.fields.name,
      size: 180,
    },
    {
      field: person.fields.phones.universalIdentifier,
      viewField: ids.fields.phones,
      size: 150,
    },
    {
      field: IDS.person.callBackReason,
      viewField: ids.fields.callBackReason,
      size: 180,
    },
    {
      field: IDS.person.callBackAt,
      viewField: ids.fields.callBackAt,
      size: 120,
    },
    {
      field: IDS.person.lastCallNote,
      viewField: ids.fields.lastCallNote,
      size: 220,
    },
  ]),
  filterGroups: [
    {
      universalIdentifier: ids.filterGroup,
      logicalOperator: ViewFilterGroupLogicalOperator.OR,
    },
  ],
  filters: [
    {
      universalIdentifier: ids.filterPast,
      fieldMetadataUniversalIdentifier: IDS.person.callBackAt,
      operand: ViewFilterOperand.IS_IN_PAST,
      value: '',
      viewFilterGroupUniversalIdentifier: ids.filterGroup,
      positionInViewFilterGroup: 0,
    },
    {
      universalIdentifier: ids.filterToday,
      fieldMetadataUniversalIdentifier: IDS.person.callBackAt,
      operand: ViewFilterOperand.IS_TODAY,
      value: '',
      viewFilterGroupUniversalIdentifier: ids.filterGroup,
      positionInViewFilterGroup: 1,
    },
  ],
  sorts: [
    {
      universalIdentifier: ids.sortCallBack,
      fieldMetadataUniversalIdentifier: IDS.person.callBackAt,
      direction: ViewSortDirection.ASC,
    },
  ],
});
