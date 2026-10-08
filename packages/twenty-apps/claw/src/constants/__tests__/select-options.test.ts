import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ACCRUAL_METHOD_OPTIONS,
  DISCOUNT_KIND_OPTIONS,
  materialUnitLabel,
  ORDER_MATERIAL_STATE_OPTIONS,
  ORDER_STATUS_OPTIONS,
  PAY_METHOD_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  STOCK_MOVEMENT_KIND_OPTIONS,
  WORKER_CATEGORY_OPTIONS,
} from 'src/constants/select-options';

const idByValue = (
  options: ReadonlyArray<{ value: string; id?: string }>,
): Record<string, string | undefined> =>
  Object.fromEntries(options.map((option) => [option.value, option.id]));

// The server keeps a stored value only while its option id stays the same, and
// an id the SDK generates changes with the label.
describe('relabelled options keep the id of their first label', () => {
  it('pins the stock movement kinds', () => {
    expect(idByValue(STOCK_MOVEMENT_KIND_OPTIONS)).toEqual({
      RECEIPT: 'f3a49374-82bc-5de5-bdeb-b177c8a7dabd',
      STOCKTAKE: '39c60125-a523-58d9-a592-bf57d41ec9cd',
      WRITE_OFF: 'c4613eef-94a1-512e-87c6-deae83f82f51',
      ORDER_EXTRA: undefined,
      SCRAP: undefined,
      WASTE: undefined,
      WORKSHOP_USE: undefined,
      SUPPLIER_RETURN: undefined,
      OTHER_OUT: undefined,
    });
  });

  it('pins the order material state that was relabelled, and only it', () => {
    expect(idByValue(ORDER_MATERIAL_STATE_OPTIONS)).toEqual({
      ENOUGH: undefined,
      SHORTAGE: undefined,
      NO_NORM: '7c5c1feb-5c5f-5d83-bfff-7985de022885',
    });
  });

  it('pins the status that became «Отправлено на установку», and only it', () => {
    expect(idByValue(ORDER_STATUS_OPTIONS)).toEqual({
      NEW: undefined,
      MEASUREMENT_SCHEDULED: undefined,
      MEASURED: undefined,
      PRODUCTION: undefined,
      QUALITY_CHECK: '96aee4e3-71ce-5947-8df6-0cc4e80c8b2a',
      INSTALLED: undefined,
      CANCELLED: undefined,
    });
    expect(
      ORDER_STATUS_OPTIONS.find((option) => option.value === 'QUALITY_CHECK')
        ?.label,
    ).toBe('Отправлено на установку');
  });
});

const labelByValue = (
  options: ReadonlyArray<{ value: string; label: string }>,
): Record<string, string> =>
  Object.fromEntries(options.map((option) => [option.value, option.label]));

describe('option lists of the money and pay model', () => {
  it.each([
    [
      'payment methods',
      PAYMENT_METHOD_OPTIONS,
      { CASH: 'Наличные', CARD: 'Карта', TRANSFER: 'Перевод' },
    ],
    ['discount kinds', DISCOUNT_KIND_OPTIONS, { PERCENT: '%', AMOUNT: 'сум' }],
    [
      'worker categories',
      WORKER_CATEGORY_OPTIONS,
      {
        MASTER: 'Мастер',
        INSTALLER: 'Установщик',
        MEASURER: 'Замерщик',
        SALES: 'Продажник',
      },
    ],
    [
      'pay methods',
      PAY_METHOD_OPTIONS,
      {
        FIXED: 'Фикса',
        PER_SQUARE_METER: 'За м²',
        PER_ORDER: 'За заказ',
        PERCENT_OF_SALES: '% от продаж',
        PER_MEASUREMENT: 'За замер',
      },
    ],
    [
      'accrual methods',
      ACCRUAL_METHOD_OPTIONS,
      {
        FIXED: 'Фикса',
        PER_SQUARE_METER: 'За м²',
        PER_ORDER: 'За заказ',
        PERCENT_OF_SALES: '% от продаж',
        PER_MEASUREMENT: 'За замер',
        BONUS: 'Премия',
        PENALTY: 'Штраф',
      },
    ],
  ])('%s are gray and worded as in the spec', (_, options, expected) => {
    expect(labelByValue(options)).toEqual(expected);
    expect(options.every((option) => option.color === 'gray')).toBe(true);
  });
});

const OPTION_ID_NAMESPACE = 'a80ff791-b940-4c47-a522-2bb478515415';

// The SDK's formula for an option without an id (add-missing-field-option-ids
// in twenty-sdk): uuid v5 of the label and the field's universal identifier.
const generatedOptionId = (label: string, fieldUniversalIdentifier: string) => {
  const bytes = createHash('sha1')
    .update(Buffer.from(OPTION_ID_NAMESPACE.replace(/-/g, ''), 'hex'))
    .update(`${label}-${fieldUniversalIdentifier}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
};

type ObjectDefinition = {
  default: {
    config: {
      nameSingular: string;
      fields: ReadonlyArray<{
        universalIdentifier: string;
        type: string;
        name: string;
        options?: ReadonlyArray<{ value: string; label: string; id?: string }>;
      }>;
    };
  };
};

const OBJECTS_DIRECTORY = join(__dirname, '../../objects');

const effectiveOptionIds = async (): Promise<Record<string, string>> => {
  const ids: Record<string, string> = {};
  const files = readdirSync(OBJECTS_DIRECTORY)
    .filter((file) => file.endsWith('.object.ts'))
    .sort();

  for (const file of files) {
    const definition: ObjectDefinition = await import(
      join(OBJECTS_DIRECTORY, file)
    );
    const { nameSingular, fields } = definition.default.config;

    for (const field of fields) {
      if (field.type !== 'SELECT' && field.type !== 'MULTI_SELECT') {
        continue;
      }

      for (const option of field.options ?? []) {
        ids[`${nameSingular}.${field.name}.${option.value}`] =
          option.id ??
          generatedOptionId(option.label, field.universalIdentifier);
      }
    }
  }

  return ids;
};

describe('every select option of every object keeps its id', () => {
  it('matches the ids the server already stores values under', async () => {
    // DO NOT update this snapshot after a relabel. A changed id here means the
    // server will drop the stored value of every record holding that option
    // (an order loses its status). Give the relabelled option the id listed
    // below as the fourth entry of its row in select-options.ts, and the test
    // passes again unchanged. Only a new option adds a line here.
    expect(await effectiveOptionIds()).toMatchInlineSnapshot(`
      {
        "clientCall.result.AGREED": "8d07771f-9079-55d8-b031-66a6cb520884",
        "clientCall.result.NO_ANSWER": "7a68ce76-fe4f-5ba0-b3fe-3a478c856cd3",
        "clientCall.result.REACHED": "16bf04cb-8277-5a7d-898a-aae52b19318a",
        "clientCall.result.REFUSED": "dcdd52d5-89a3-543e-8e1e-6261c3078541",
        "design.metal.PROFILE": "ec511866-64c9-579c-a27a-177fb7713c20",
        "design.metal.REBAR": "ccb5ceb7-9d32-54cf-a5da-1ec2b3dee3a8",
        "design.metal.ROD": "cc39eb8d-5e6a-56fe-9c29-493b51ff6d2c",
        "extraService.kind.SERVICE": "1d82585c-a51b-580b-89b3-a8ca3e960955",
        "extraService.kind.VISOR": "ebfa1de0-903e-5f60-89cb-4d6dc0d74f33",
        "extraService.unit.FIXED": "6339c37e-2422-5d13-a014-f9cf5f998566",
        "extraService.unit.PER_PIECE": "7c020043-5f6b-5436-853b-941051f6ef59",
        "extraService.unit.PER_RUNNING_METER": "d7ebcff6-ff3e-5715-bc24-5662f6484bd3",
        "extraService.unit.PER_SQUARE_METER": "98e42d31-ccc1-5203-b203-023288acbcd8",
        "master.categories.INSTALLER": "c2f70763-e866-538e-9a0d-1ebc05234821",
        "master.categories.MASTER": "55971ff8-66a8-5caa-a4c7-14085f768055",
        "master.categories.MEASURER": "2fbfb44d-2ee2-55b3-805d-cb55919c657d",
        "master.categories.SALES": "a52d5352-6865-5292-802a-a73a00a95e33",
        "masterPayment.kind.ADVANCE": "1c3a5879-0ca6-525c-bf22-fea2e634f0ea",
        "masterPayment.kind.SETTLEMENT": "8df999f9-9131-55d2-b5ea-67e3de0db055",
        "material.stockState.BUY": "25bd9a72-40b3-50f4-ad58-1142ca25e97e",
        "material.stockState.LOW": "0f307d05-7bca-5244-ba2e-7d98c683254c",
        "material.stockState.OK": "4040c6f9-2bd4-594a-bf11-08b4dd413ca8",
        "material.unit.KILOGRAM": "b789b016-e8dc-510f-ac15-d69ac6fe52c0",
        "material.unit.LITER": "1499bd59-048a-56ff-9de5-74a02a23fd48",
        "material.unit.METER": "d3df0fa9-71ba-5804-9813-5066808ce787",
        "material.unit.PIECE": "592b3e58-e2a2-5cc4-8de4-ca03a77068f4",
        "material.unit.SQUARE_METER": "503171c8-fa2d-509e-b5dc-666ca5c6a932",
        "moneyEntry.kind.COUNT_DIFFERENCE": "d34d2706-2b03-5d59-8154-82612db58d6c",
        "moneyEntry.kind.EXPENSE": "07615bca-8ec3-50c6-a76c-0b99120ae4a6",
        "moneyEntry.kind.HANDOVER": "5f78c82d-c6f7-5149-9703-53dec84a5b25",
        "moneyEntry.kind.INCOME": "f9c703e0-c7ff-5102-9ec5-d61f6f1c3426",
        "moneyEntry.kind.OPENING_BALANCE": "10ddb4de-f368-565a-a1f6-fa1971a20722",
        "moneyEntry.kind.OWNER_DEPOSIT": "3c9e2633-4202-59cb-be2f-db6ccda68913",
        "moneyEntry.kind.OWNER_DRAW": "67f2a6ce-2607-5358-b852-75e57ff85355",
        "moneyEntry.kind.SUPPLIER_PAYMENT": "312f1f6e-265c-5828-8143-d39b4de3c433",
        "moneyEntry.kind.TRANSFER": "0e39ec3c-0b69-55ae-ac34-cf2506de5789",
        "moneyEntry.wallet.ACCOUNT": "3f861ea0-9a72-531c-b762-9cf51ea5c028",
        "moneyEntry.wallet.CARD": "ee67aba7-aad8-54d0-b1bc-9bea98b00748",
        "moneyEntry.wallet.CASH": "73431845-da7f-53aa-a3d3-d70cc2125251",
        "order.cancelReason.CHANGED_MIND": "88b6a042-9dc6-5dfc-a50e-c88be63c0493",
        "order.cancelReason.COMPETITOR": "a5933d14-a522-5899-9741-c05276f9a4e4",
        "order.cancelReason.OTHER": "4755c43e-ac8a-556e-827a-61ec72cabcd2",
        "order.cancelReason.TOO_EXPENSIVE": "479a09b8-2a8c-56f6-903c-308f6c9a2145",
        "order.cancelReason.UNREACHABLE": "95cc8def-3b8b-5bf0-9525-4d42e9852193",
        "order.deadlineState.DUE_TODAY": "0dd28c3b-18a7-5f3a-9cde-ad6102ff91a3",
        "order.deadlineState.OVERDUE": "6a7a0025-138f-5136-958a-9ff7c3df215f",
        "order.discountKind.AMOUNT": "174ae085-2818-558d-a7f6-a3ea894dc361",
        "order.discountKind.PERCENT": "5967281b-4dcb-5b9a-861b-6e109886906c",
        "order.district.ALMAZAR": "e0db67e9-897e-53bf-9993-9549648d31c4",
        "order.district.BEKTEMIR": "304a2dcb-55f8-5621-8024-60802eea61e9",
        "order.district.CHILANZAR": "aeef05df-b71f-533c-a792-361e24156e7b",
        "order.district.MIRABAD": "23c933c4-e209-583d-a1be-1b7a266d41bb",
        "order.district.MIRZO_ULUGBEK": "520f5f19-b45c-524d-ba3f-1c42249427e0",
        "order.district.SERGELI": "541053ff-dbe1-56e9-9bcb-0d1511042b79",
        "order.district.SHAYKHANTAKHUR": "cd547cc5-8b7a-5568-b462-74196571aa9c",
        "order.district.UCHTEPA": "e8fbf52f-29f5-59bd-8eed-44ac80f2bed1",
        "order.district.YAKKASARAY": "8362f8c6-13ab-5aff-b95b-1e9c4dbd3167",
        "order.district.YANGIHAYOT": "38120765-df67-50ea-a1f3-90a4109fa453",
        "order.district.YASHNABAD": "f6955fdd-85ea-5459-a579-87886e5c1b49",
        "order.district.YUNUSABAD": "c5993ba3-5d38-51b3-b5d1-3759a0428df3",
        "order.materialState.ENOUGH": "2442e146-d6b0-5038-97f6-a450f0fa1c73",
        "order.materialState.NO_NORM": "7c5c1feb-5c5f-5d83-bfff-7985de022885",
        "order.materialState.SHORTAGE": "e403f536-3d74-5719-9c89-f39b3dfe38a2",
        "order.productionStage.CUTTING": "0b388d80-c91b-5b0b-a45e-222bfd36d814",
        "order.productionStage.PAINTING": "fa0f1497-6b7b-555e-8530-eb53a49dba04",
        "order.productionStage.WELDING": "b90b58c6-3b05-5ab8-979a-7858be3ea0c6",
        "order.source.CALL": "101a45ee-db71-5a19-867b-b8ed5c587937",
        "order.source.FACEBOOK": "ba50fa75-fad1-5329-bdd8-27f7cece4c4d",
        "order.source.INSTAGRAM": "0d29981f-682a-5763-8984-ae9b00f4a996",
        "order.source.OLX": "224ac30f-0d10-5f4e-985e-bc679598a7fb",
        "order.source.REFERRAL": "a5e8d756-0b5a-52ad-92f1-05c741533ac3",
        "order.source.TELEGRAM": "b9535a61-099a-5ac4-b718-03f85e39c48f",
        "order.source.WEBSITE": "90c3080a-e89d-5cec-9330-589c851317d6",
        "order.status.CANCELLED": "7ff2a9ce-4556-5ee6-9d7e-5341012b5a6f",
        "order.status.INSTALLED": "061cb9a1-4f10-597f-b6d6-e2d2cf6eb26d",
        "order.status.MEASURED": "21b7d346-e57b-563f-aa22-dfbfdfd57eb8",
        "order.status.MEASUREMENT_SCHEDULED": "9e346f47-2e27-5ece-89fe-9d9f14ddf857",
        "order.status.NEW": "25c79dc6-9489-5c70-a79b-22b147cc46d2",
        "order.status.PRODUCTION": "328ba57a-e0bd-5e2b-9efa-f29b3957e09c",
        "order.status.QUALITY_CHECK": "96aee4e3-71ce-5947-8df6-0cc4e80c8b2a",
        "order.urgency.URGENT": "6a99201a-abd9-5799-8fa1-2ab827da67b9",
        "orderItem.projectionKind.BOTTOM": "530863de-65b8-5060-a99a-a0652a211c80",
        "orderItem.projectionKind.BOTTOM_AND_TOP": "2bf27b20-6bec-5f0c-a270-4054f630e410",
        "orderItem.projectionKind.NONE": "6bfc3b43-d021-5a9a-9eb9-4a0b44a91c2f",
        "orderPayment.method.CARD": "200a51f9-3ff9-54ed-b654-187fa6c0df86",
        "orderPayment.method.CASH": "60529631-3fa3-5a83-a9c0-7cc2fd387317",
        "orderPayment.method.TRANSFER": "aba49e83-d595-5b08-b727-78a71ecd8fac",
        "payAccrual.method.BONUS": "5933d152-f5d1-5256-b92d-73463644a0ae",
        "payAccrual.method.FIXED": "065621bb-ceff-52ea-ab31-0a190b8fba1b",
        "payAccrual.method.PENALTY": "62f4b323-699b-54ab-b098-cdd55bebff9f",
        "payAccrual.method.PERCENT_OF_SALES": "e126b626-07c0-520a-a6e6-2f84af9ac015",
        "payAccrual.method.PER_MEASUREMENT": "bf8f0570-0ade-5993-9102-7936425e17e3",
        "payAccrual.method.PER_ORDER": "0a48672e-603a-5b6a-982e-ed9810dc1f02",
        "payAccrual.method.PER_SQUARE_METER": "98286d9a-fd80-51ef-81a5-d5b48b2c2629",
        "payAccrual.work.INSTALLER": "77a18229-fa15-5483-803f-ada8dfc17eb0",
        "payAccrual.work.MASTER": "be5cea88-7058-533d-856b-616afc988a84",
        "payAccrual.work.MEASURER": "dd08ed53-3240-5839-b3d4-b2dd4523e152",
        "payAccrual.work.SALES": "15062c3e-7028-511d-93d3-85cb9799400e",
        "payRule.method.FIXED": "5e564e81-bbb2-5b84-b93c-fc77b1c6c18a",
        "payRule.method.PERCENT_OF_SALES": "1716a3b5-4d34-5f42-91b6-ac56b5650025",
        "payRule.method.PER_MEASUREMENT": "87a3cd13-12fd-5001-ae49-fb96edfb6623",
        "payRule.method.PER_ORDER": "13ca692d-5dd8-5caf-9429-5b6f9a7f6244",
        "payRule.method.PER_SQUARE_METER": "57a52c0b-4e77-52a1-aa4b-c6c903f788fb",
        "payRule.work.INSTALLER": "39069f5c-f165-5100-8b59-3f7df30fd8a2",
        "payRule.work.MASTER": "3576f779-8326-5b9d-9156-64074867c677",
        "payRule.work.MEASURER": "6a93b7bc-3f6f-5bf9-953d-67974b799149",
        "payRule.work.SALES": "578ee3f3-442d-5dc5-8574-d0978a62d7b0",
        "stockMovement.kind.ORDER_EXTRA": "e0f7f3a3-c877-5b52-b217-5a0195696620",
        "stockMovement.kind.OTHER_OUT": "a8aa2447-092d-557a-8891-44307ec42794",
        "stockMovement.kind.RECEIPT": "f3a49374-82bc-5de5-bdeb-b177c8a7dabd",
        "stockMovement.kind.SCRAP": "62d14bc1-cddd-56c3-87cf-43fe8211b00f",
        "stockMovement.kind.STOCKTAKE": "39c60125-a523-58d9-a592-bf57d41ec9cd",
        "stockMovement.kind.SUPPLIER_RETURN": "b1dc542d-f088-5eb8-99d6-8d2d423b5ff1",
        "stockMovement.kind.WASTE": "1838530d-cb49-57f9-85fe-5b3d4c5abcb2",
        "stockMovement.kind.WORKSHOP_USE": "0d1c07a0-f883-5f39-9bd7-b81801eee7bf",
        "stockMovement.kind.WRITE_OFF": "c4613eef-94a1-512e-87c6-deae83f82f51",
      }
    `);
  });
});

describe('materialUnitLabel', () => {
  it('words a unit the way it is shown after a number', () => {
    expect(materialUnitLabel('METER')).toBe('м');
    expect(materialUnitLabel('SQUARE_METER')).toBe('м²');
    expect(materialUnitLabel('PIECE')).toBe('шт');
  });

  it('gives nothing for a unit that is missing or unknown', () => {
    expect(materialUnitLabel(null)).toBe('');
    expect(materialUnitLabel(undefined)).toBe('');
    expect(materialUnitLabel('BARREL')).toBe('');
  });
});
