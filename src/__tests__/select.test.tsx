import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Select } from '../components/ui/Select';

/**
 * A custom dropdown gives up everything a native <select> does for free, so
 * the keyboard and screen-reader behaviour has to be tested rather than
 * assumed. These are the parts a mouse-only check would never reach.
 */

const OPTIONS = [
  { value: 'dark', label: 'Command', hint: 'Muted dark canvas' },
  { value: 'satellite', label: 'Satellite', hint: 'Real imagery' },
  { value: 'terrain', label: 'Elevation', hint: 'Contours', disabled: true },
  { value: 'streets', label: 'Streets', hint: 'Street names' },
];

function setup(value = 'dark') {
  const onChange = vi.fn();
  render(
    <Select label="Base map" value={value} options={OPTIONS} onChange={onChange} />
  );
  return { onChange, trigger: screen.getByRole('button', { name: 'Base map' }) };
}

describe('Select', () => {
  it('shows the current value on the trigger without opening', () => {
    const { trigger } = setup('satellite');
    expect(trigger.textContent).toContain('Satellite');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens on click and marks the current option selected', () => {
    const { trigger } = setup('satellite');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(4);
    expect(options[1].getAttribute('aria-selected')).toBe('true');
    expect(options[0].getAttribute('aria-selected')).toBe('false');
  });

  it('opens with the keyboard', () => {
    const { trigger } = setup();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('selects with Enter and closes', () => {
    const { onChange, trigger } = setup('dark');
    fireEvent.click(trigger);
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('satellite');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('steps over disabled options instead of stalling on them', () => {
    const { onChange, trigger } = setup('satellite');
    fireEvent.click(trigger);
    const list = screen.getByRole('listbox');
    // From Satellite, the next enabled entry is Streets - Elevation is disabled.
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('streets');
  });

  it('never selects a disabled option by click', () => {
    const { onChange, trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText('Elevation'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes on Escape without selecting', () => {
    const { onChange, trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes when a click lands outside', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('wraps from the last option to the first', () => {
    const { onChange, trigger } = setup('streets');
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('shows the placeholder rather than pretending the first option is chosen', () => {
    const onChange = vi.fn();
    render(
      <Select
        label="Look into"
        value=""
        placeholder="Look into"
        options={OPTIONS}
        onChange={onChange}
      />
    );
    const trigger = screen.getByRole('button', { name: 'Look into' });
    expect(trigger.textContent).toContain('Look into');
    expect(trigger.textContent).not.toContain('Command');
  });

  it('carries the hint into the menu but not onto the trigger', () => {
    const { trigger } = setup();
    expect(trigger.textContent).not.toContain('Muted dark canvas');
    fireEvent.click(trigger);
    expect(screen.getByText('Muted dark canvas')).toBeTruthy();
  });
});
