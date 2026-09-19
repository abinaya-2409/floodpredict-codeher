/**
 * "A map is being moved right now."
 *
 * A dragged map and a decorative rain canvas are asking for the same frame,
 * and only one of them is under the user's finger. The map wins: while any
 * map is moving, the background stops drawing and hands its share of the
 * frame over.
 *
 * Counted rather than boolean, because two maps can be mounted at once and
 * a plain flag would let the first one to stop moving speak for both.
 *
 * The signal is a DOM event rather than a store or a context, because the
 * two ends are a Leaflet callback and a `requestAnimationFrame` loop inside
 * a different component - neither of them React state, and neither should
 * have to know the other exists.
 */

export const MAP_MOTION_EVENT = 'floodypredict-map-move';

let moving = 0;

function announce(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<boolean>(MAP_MOTION_EVENT, { detail: moving > 0 })
  );
}

/** A map started moving. Pair every call with `endMapMotion`. */
export function beginMapMotion(): void {
  moving += 1;
  if (moving === 1) announce();
}

/** A map stopped moving. */
export function endMapMotion(): void {
  // Never below zero: a Leaflet map fires `zoomend` without a matching
  // `zoomstart` when the zoom is set programmatically, and one unbalanced
  // end would otherwise leave the counter negative and the background
  // permanently paused.
  if (moving === 0) return;
  moving -= 1;
  if (moving === 0) announce();
}

/** True while any map is moving. Exposed for tests and for late joiners. */
export function isMapMoving(): boolean {
  return moving > 0;
}

/** Test seam: forget any motion in progress. */
export function resetMapMotion(): void {
  moving = 0;
}

/**
 * Wires a map's own movement events to the signal.
 *
 * Takes the `on`/`off` pair rather than a map, because Leaflet and MapLibre
 * disagree about almost everything else but agree about these four event
 * names. Returns the unsubscribe.
 */
export function trackMapMotion(
  on: (event: string, handler: () => void) => void,
  off: (event: string, handler: () => void) => void
): () => void {
  const start = () => beginMapMotion();
  const stop = () => endMapMotion();
  const STARTS = ['movestart', 'zoomstart'];
  const ENDS = ['moveend', 'zoomend'];

  for (const e of STARTS) on(e, start);
  for (const e of ENDS) on(e, stop);

  return () => {
    for (const e of STARTS) off(e, start);
    for (const e of ENDS) off(e, stop);
    // Whatever this map still had outstanding is over now that it is gone.
    resetMapMotion();
  };
}
