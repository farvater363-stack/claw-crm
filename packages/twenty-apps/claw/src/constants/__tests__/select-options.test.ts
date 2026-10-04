import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  materialUnitLabel,
  ORDER_MATERIAL_STATE_OPTIONS,
  STOCK_MOVEMENT_KIND_OPTIONS,
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
    });
  });

  it('pins the order material state that was relabelled, and only it', () => {
    expect(idByValue(ORDER_MATERIAL_STATE_OPTIONS)).toEqual({
      ENOUGH: undefined,
      SHORTAGE: undefined,
      NO_NORM: '7c5c1feb-5c5f-5d83-bfff-7985de022885',
    });
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
        "design.metal.PROFILE": "ec511866-64c9-579c-a27a-177fb7713c20",
        "design.metal.REBAR": "ccb5ceb7-9d32-54cf-a5da-1ec2b3dee3a8",
        "design.metal.ROD": "cc39eb8d-5e6a-56fe-9c29-493b51ff6d2c",
        "extraService.kind.SERVICE": "1d82585c-a51b-580b-89b3-a8ca3e960955",
        "extraService.kind.VISOR": "ebfa1de0-903e-5f60-89cb-4d6dc0d74f33",
        "extraService.unit.FIXED": "6339c37e-2422-5d13-a014-f9cf5f998566",
        "extraService.unit.PER_PIECE": "7c020043-5f6b-5436-853b-941051f6ef59",
        "extraService.unit.PER_RUNNING_METER": "d7ebcff6-ff3e-5715-bc24-5662f6484bd3",
        "extraService.unit.PER_SQUARE_METER": "98e42d31-ccc1-5203-b203-023288acbcd8",
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
        "order.cancelReason.CHANGED_MIND": "88b6a042-9dc6-5dfc-a50e-c88be63c0493",
        "order.cancelReason.COMPETITOR": "a5933d14-a522-5899-9741-c05276f9a4e4",
        "order.cancelReason.OTHER": "4755c43e-ac8a-556e-827a-61ec72cabcd2",
        "order.cancelReason.TOO_EXPENSIVE": "479a09b8-2a8c-56f6-903c-308f6c9a2145",
        "order.cancelReason.UNREACHABLE": "95cc8def-3b8b-5bf0-9525-4d42e9852193",
        "order.deadlineState.DUE_TODAY": "0dd28c3b-18a7-5f3a-9cde-ad6102ff91a3",
        "order.deadlineState.ON_TIME": "bb148f29-497c-5202-b2ce-334169ebda4f",
        "order.deadlineState.OVERDUE": "6a7a0025-138f-5136-958a-9ff7c3df215f",
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
        "order.source.CALL": "101a45ee-db71-5a19-867b-b8ed5c587937",
        "order.source.FACEBOOK": "ba50fa75-fad1-5329-bdd8-27f7cece4c4d",
        "order.source.INSTAGRAM": "0d29981f-682a-5763-8984-ae9b00f4a996",
        "order.source.OLX": "224ac30f-0d10-5f4e-985e-bc679598a7fb",
        "order.source.REFERRAL": "a5e8d756-0b5a-52ad-92f1-05c741533ac3",
        "order.source.TELEGRAM": "b9535a61-099a-5ac4-b718-03f85e39c48f",
        "order.source.WEBSITE": "90c3080a-e89d-5cec-9330-589c851317d6",
        "order.status.CANCELLED": "7ff2a9ce-4556-5ee6-9d7e-5341012b5a6f",
        "order.status.CLOSED": "009ccbd6-9af7-5cde-ad3c-8d8ec27496e0",
        "order.status.INSTALLED": "061cb9a1-4f10-597f-b6d6-e2d2cf6eb26d",
        "order.status.MEASURED": "21b7d346-e57b-563f-aa22-dfbfdfd57eb8",
        "order.status.MEASUREMENT_SCHEDULED": "9e346f47-2e27-5ece-89fe-9d9f14ddf857",
        "order.status.NEW": "25c79dc6-9489-5c70-a79b-22b147cc46d2",
        "order.status.PRICE_APPROVAL": "d3562433-31fc-56a1-bfd8-46f5d56c142e",
        "order.status.PRODUCTION": "328ba57a-e0bd-5e2b-9efa-f29b3957e09c",
        "order.status.QUALITY_CHECK": "96aee4e3-71ce-5947-8df6-0cc4e80c8b2a",
        "order.status.READY": "0a8e1b2c-ba43-5537-90a3-199df4670212",
        "stockMovement.kind.RECEIPT": "f3a49374-82bc-5de5-bdeb-b177c8a7dabd",
        "stockMovement.kind.STOCKTAKE": "39c60125-a523-58d9-a592-bf57d41ec9cd",
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
