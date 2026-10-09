import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { money } from 'src/objects/money-field';

const { signedContract } = IDS;

const text = (
  universalIdentifier: string,
  name: string,
  label: string,
  icon: string,
) =>
  ({
    universalIdentifier,
    type: FieldType.TEXT,
    name,
    label,
    icon,
    isNullable: true,
  }) as const;

// One signing of the contract by a client, as the contract's section 14.5
// asks the CRM to keep it. Never edited: a changed order is signed again, and
// the newest signing of an order is the one in force.
export default defineObject({
  universalIdentifier: signedContract.object,
  nameSingular: 'signedContract',
  namePlural: 'signedContracts',
  labelSingular: 'Подписанный договор',
  labelPlural: 'Подписанные договоры',
  icon: 'IconSignature',
  labelIdentifierFieldMetadataUniversalIdentifier: signedContract.name,
  fields: [
    text(signedContract.name, 'name', 'Название', 'IconAbc'),
    {
      universalIdentifier: signedContract.order,
      type: FieldType.RELATION,
      name: 'order',
      label: 'Заказ',
      icon: 'IconClipboardList',
      relationTargetObjectMetadataUniversalIdentifier: IDS.order.object,
      relationTargetFieldMetadataUniversalIdentifier: IDS.order.signedContracts,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'orderId',
      },
    },
    {
      universalIdentifier: signedContract.pdf,
      type: FieldType.FILES,
      name: 'pdf',
      label: 'PDF',
      icon: 'IconFileTypePdf',
      isNullable: true,
      universalSettings: { maxNumberOfValues: 1 },
    },
    {
      universalIdentifier: signedContract.signedAt,
      type: FieldType.DATE_TIME,
      name: 'signedAt',
      label: 'Подписан',
      icon: 'IconCalendarCheck',
      isNullable: true,
    },
    text(signedContract.clientName, 'clientName', 'Клиент', 'IconUser'),
    text(signedContract.clientPhone, 'clientPhone', 'Телефон', 'IconPhone'),
    money(signedContract.total, 'total', 'Итого'),
    {
      universalIdentifier: signedContract.templateVersion,
      type: FieldType.NUMBER,
      name: 'templateVersion',
      label: 'Версия договора',
      icon: 'IconVersions',
      isNullable: true,
    },
    // Sizes, grilles and total as signed; the order page compares it with the
    // order now to tell that the contract no longer matches.
    text(signedContract.termsKey, 'termsKey', 'Условия', 'IconListCheck'),
    text(
      signedContract.checkCode,
      'checkCode',
      'Код проверки',
      'IconShieldCheck',
    ),
    text(signedContract.fileCode, 'fileCode', 'Код файла', 'IconFingerprint'),
    text(signedContract.signedBy, 'signedBy', 'Чей планшет', 'IconUserCheck'),
    text(signedContract.device, 'device', 'Устройство', 'IconDeviceTablet'),
  ],
});
