export const createDeferred = () => {
  const state = { resolve: (): void => {} };
  const promise = new Promise<void>(resolve => {
    state.resolve = resolve;
  });

  return { promise, resolve: (): void => state.resolve() };
};
