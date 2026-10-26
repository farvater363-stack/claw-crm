import '@/testing/setupServerRenderingGlobals';

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { type FrontComponentThread } from '@/types/FrontComponentThread';
import { FrontComponentHostWindowEventsEffect } from '../FrontComponentHostWindowEventsEffect';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const createStubThread = () =>
  ({
    imports: {
      dispatchHostWindowEvent: jest.fn().mockResolvedValue(undefined),
    },
  }) as unknown as FrontComponentThread;

describe('FrontComponentHostWindowEventsEffect', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should forward the page visibility and window focus to the worker', () => {
    const thread = createStubThread();

    act(() => {
      root.render(
        createElement(FrontComponentHostWindowEventsEffect, { thread }),
      );
    });

    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));

    expect(thread.imports.dispatchHostWindowEvent).toHaveBeenNthCalledWith(1, {
      type: 'visibilitychange',
      visibilityState: document.visibilityState,
    });
    expect(thread.imports.dispatchHostWindowEvent).toHaveBeenNthCalledWith(2, {
      type: 'focus',
      visibilityState: document.visibilityState,
    });
  });

  it('should stop forwarding once unmounted', () => {
    const thread = createStubThread();

    act(() => {
      root.render(
        createElement(FrontComponentHostWindowEventsEffect, { thread }),
      );
    });
    act(() => {
      root.unmount();
    });

    window.dispatchEvent(new Event('focus'));

    expect(thread.imports.dispatchHostWindowEvent).not.toHaveBeenCalled();
  });
});
