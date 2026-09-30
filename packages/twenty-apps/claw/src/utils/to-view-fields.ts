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
