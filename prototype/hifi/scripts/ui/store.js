(() => {
  "use strict";

  function createStore(initialState) {
    const listeners = new Set();
    return {
      getState() {
        return initialState;
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      update(mutator) {
        mutator(initialState);
        for (const listener of listeners) listener(initialState);
      },
    };
  }

  window.HIFI_STORE = { createStore };
})();
