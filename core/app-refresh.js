// app-refresh.js — global helper for preserving UI state across appDataRefreshed
// Usage in any page:
//   AppRefresh.register({
//       save:    () => myStateSnapshot,
//       restore: (snap) => restoreMyState(snap)
//   });
// Unregister when page unloads (optional — auto-cleared on next register).

window.AppRefresh = (() => {
    let _handler = null;

    window.addEventListener('appDataRefreshed', () => {
        if (!_handler) return;
        const snap = _handler.save();
        // restore after the page's own appDataRefreshed handlers have run
        if (snap !== undefined && snap !== null)
            requestAnimationFrame(() => _handler?.restore(snap));
    }, true); // capture phase — runs before page handlers

    return {
        register:   (h) => { _handler = h; },
        unregister: ()  => { _handler = null; },
    };
})();
