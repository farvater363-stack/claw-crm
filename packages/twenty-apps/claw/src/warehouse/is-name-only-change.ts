type UpdateEvent = { properties: { updatedFields?: string[] } };

// A batch with nothing known about it counts as a real change: one resync too many is cheaper than one missed.
export const isNameOnlyChange = (events: UpdateEvent[]): boolean =>
  events.length > 0 &&
  events.every(
    ({ properties: { updatedFields } }) =>
      updatedFields?.length === 1 && updatedFields[0] === 'name',
  );
