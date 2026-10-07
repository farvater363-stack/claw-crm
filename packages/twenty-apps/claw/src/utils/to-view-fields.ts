export type ViewFieldEntry = {
  field: string;
  viewField: string;
  group?: string;
  isVisible?: boolean;
  size?: number;
};

// Each view field id stays tied to its field, so fields can be reordered or
// grouped without re-pointing an existing id at another field.
export const toKeyedViewFields = (entries: readonly ViewFieldEntry[]) =>
  entries.map(
    ({ field, viewField, group, isVisible = true, size }, position) => ({
      universalIdentifier: viewField,
      fieldMetadataUniversalIdentifier: field,
      position,
      isVisible,
      ...(size !== undefined ? { size } : {}),
      ...(group !== undefined
        ? { viewFieldGroupUniversalIdentifier: group }
        : {}),
    }),
  );
