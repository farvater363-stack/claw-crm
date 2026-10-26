import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listenForReturn } from 'src/dashboard/reload-on-return';

const createTargets = () => {
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  });

  return { document, window: new EventTarget() };
};

describe('listenForReturn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reloads when the tab becomes visible again', () => {
    const targets = createTargets();
    const onReturn = vi.fn();

    listenForReturn(onReturn, targets);
    targets.document.visibilityState = 'hidden';
    targets.document.dispatchEvent(new Event('visibilitychange'));

    expect(onReturn).not.toHaveBeenCalled();

    targets.document.visibilityState = 'visible';
    targets.document.dispatchEvent(new Event('visibilitychange'));

    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('reloads when the window gets the focus back', () => {
    const targets = createTargets();
    const onReturn = vi.fn();

    listenForReturn(onReturn, targets);
    targets.window.dispatchEvent(new Event('focus'));

    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('reloads once when both arrive together, and again on the next return', () => {
    const targets = createTargets();
    const onReturn = vi.fn();

    listenForReturn(onReturn, targets);
    targets.document.dispatchEvent(new Event('visibilitychange'));
    targets.window.dispatchEvent(new Event('focus'));

    expect(onReturn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    targets.window.dispatchEvent(new Event('focus'));

    expect(onReturn).toHaveBeenCalledTimes(2);
  });

  it('stops listening once the screen is gone', () => {
    const targets = createTargets();
    const onReturn = vi.fn();

    listenForReturn(onReturn, targets)();
    targets.window.dispatchEvent(new Event('focus'));

    expect(onReturn).not.toHaveBeenCalled();
  });
});
