import { dispatchHostWindowEvent } from '../dispatchHostWindowEvent';

const createTargets = () => ({
  document: new EventTarget(),
  window: new EventTarget(),
});

describe('dispatchHostWindowEvent', () => {
  it('should fire visibilitychange on the document with the host state', () => {
    const targets = createTargets();
    const states: unknown[] = [];

    targets.document.addEventListener('visibilitychange', () => {
      states.push([
        (targets.document as unknown as Document).visibilityState,
        (targets.document as unknown as Document).hidden,
      ]);
    });

    dispatchHostWindowEvent(
      { type: 'visibilitychange', visibilityState: 'hidden' },
      targets,
    );
    dispatchHostWindowEvent(
      { type: 'visibilitychange', visibilityState: 'visible' },
      targets,
    );

    expect(states).toEqual([
      ['hidden', true],
      ['visible', false],
    ]);
  });

  it('should fire focus on the window, not the document', () => {
    const targets = createTargets();
    const onWindowFocus = jest.fn();
    const onDocumentFocus = jest.fn();

    targets.window.addEventListener('focus', onWindowFocus);
    targets.document.addEventListener('focus', onDocumentFocus);

    dispatchHostWindowEvent(
      { type: 'focus', visibilityState: 'visible' },
      targets,
    );

    expect(onWindowFocus).toHaveBeenCalledTimes(1);
    expect(onDocumentFocus).not.toHaveBeenCalled();
  });
});
