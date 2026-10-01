export const toViewFields = (
  fieldIds: readonly string[],
  viewFieldIds: readonly string[],
) =>
  fieldIds.map((fieldMetadataUniversalIdentifier, position) => ({
    universalIdentifier: viewFieldIds[position],
    fieldMetadataUniversalIdentifier,
    position,
    isVisible: true,
  }));

export type ViewFieldEntry = {
  field: string;
  viewField: string;
  group?: string;
  isVisible?: boolean;
};

// Each view field id stays tied to its field, so fields can be reordered or
// grouped without re-pointing an existing id at another field.
export const toKeyedViewFields = (entries: readonly ViewFieldEntry[]) =>
  entries.map(({ field, viewField, group, isVisible = true }, position) => ({
    universalIdentifier: viewField,
    fieldMetadataUniversalIdentifier: field,
    position,
    isVisible,
    ...(group !== undefined
      ? { viewFieldGroupUniversalIdentifier: group }
      : {}),
  }));
