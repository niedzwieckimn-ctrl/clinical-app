// Shared, timezone-independent half-hour selection rules.
(function (root) {
  const START = 8 * 60, END = 20 * 60, STEP = 30;
  const clock = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  function selection(a, b, blocked = []) {
    if (![a, b].every(Number.isInteger) || Math.min(a, b) < 0 || Math.max(a, b) >= 24) return null;
    const first = Math.min(a, b), last = Math.max(a, b);
    for (let i = first; i <= last; i++) if (blocked[i]) return null;
    return { start: clock(START + first * STEP), end: clock(START + (last + 1) * STEP), minutes: (last - first + 1) * STEP, first, last };
  }
  root.BookingRange = { START, END, STEP, clock, selection };
})(globalThis);
