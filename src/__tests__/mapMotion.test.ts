import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MAP_MOTION_EVENT,
  beginMapMotion,
  endMapMotion,
  isMapMoving,
  resetMapMotion,
  trackMapMotion,
} from '../utils/mapMotion';

/**
 * The failure this guards is silent and permanent.
 *
 * If the count ever settles above zero, the ambient background stops
 * drawing and never starts again - a blank sky with no error, no warning
 * and nothing in the console. If it goes below zero, the next real drag
 * fails to pause anything. Neither shows up in a screenshot, so both are
 * tested rather than looked at.
 */
describe('map motion is counted, not flagged', () => {
  beforeEach(() => resetMapMotion());

  it('is still while nothing is moving', () => {
    expect(isMapMoving()).toBe(false);
  });

  it('is moving between a start and its end', () => {
    beginMapMotion();
    expect(isMapMoving()).toBe(true);
    endMapMotion();
    expect(isMapMoving()).toBe(false);
  });

  it('stays moving while a second map is still going', () => {
    // Two maps can be mounted at once. A boolean would let whichever
    // stopped first speak for both.
    beginMapMotion();
    beginMapMotion();
    endMapMotion();
    expect(isMapMoving()).toBe(true);
    endMapMotion();
    expect(isMapMoving()).toBe(false);
  });

  it('survives an end with no matching start', () => {
    // Leaflet fires zoomend without zoomstart when the zoom is set
    // programmatically. One unbalanced end must not drive the count
    // negative, or the next real drag would never pause the background.
    endMapMotion();
    endMapMotion();
    expect(isMapMoving()).toBe(false);
    beginMapMotion();
    expect(isMapMoving()).toBe(true);
    endMapMotion();
    expect(isMapMoving()).toBe(false);
  });

  it('announces only on the edges, not on every event', () => {
    const seen: boolean[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent<boolean>).detail);
    window.addEventListener(MAP_MOTION_EVENT, listener);

    beginMapMotion();
    beginMapMotion();
    beginMapMotion();
    endMapMotion();
    endMapMotion();
    endMapMotion();

    window.removeEventListener(MAP_MOTION_EVENT, listener);
    // One "started", one "stopped" - not six.
    expect(seen).toEqual([true, false]);
  });
});

describe('a map wires its own events to the signal', () => {
  beforeEach(() => resetMapMotion());

  it('subscribes to the four names Leaflet and MapLibre agree on', () => {
    const on = vi.fn();
    const off = vi.fn();
    const untrack = trackMapMotion(on, off);

    const subscribed = on.mock.calls.map(([e]) => e).sort();
    expect(subscribed).toEqual(['movestart', 'moveend', 'zoomstart', 'zoomend'].sort());

    untrack();
    const unsubscribed = off.mock.calls.map(([e]) => e).sort();
    expect(unsubscribed).toEqual(subscribed);
  });

  it('leaves nothing moving when the map unmounts mid-drag', () => {
    const handlers: Record<string, () => void> = {};
    const on = (e: string, h: () => void) => {
      handlers[e] = h;
    };
    const off = () => {};

    const untrack = trackMapMotion(on, off);
    handlers.movestart();
    expect(isMapMoving()).toBe(true);

    // The user switches tab mid-drag: moveend never arrives.
    untrack();
    expect(isMapMoving()).toBe(false);
  });
});
