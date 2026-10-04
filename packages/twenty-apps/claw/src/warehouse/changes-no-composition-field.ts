type UpdateEvent = { properties: { updatedFields?: string[] } };

// The server reports a changed relation under both names, with and without `Id`.
const COMPOSITION_FIELDS = new Set([
  'materialId',
  'designId',
  'extraServiceId',
  'quantityPerUnit',
  'material',
  'design',
  'extraService',
]);

// Decided by what is absent, not by equality with `name`: every update also carries `updatedBy`. Unknown counts as a real change.
export const changesNoCompositionField = (events: UpdateEvent[]): boolean =>
  events.length > 0 &&
  events.every(
    ({ properties: { updatedFields } }) =>
      updatedFields !== undefined &&
      !updatedFields.some((field) => COMPOSITION_FIELDS.has(field)),
  );
