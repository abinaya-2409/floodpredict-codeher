import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../components/ui/Button';
import { Badge, RiskBadge } from '../components/ui/Badge';
import { StatTile } from '../components/ui/StatTile';
import { Panel } from '../components/ui/Panel';

describe('Button', () => {
  it('announces pressed state for toggles', () => {
    render(
      <Button active onClick={() => {}}>
        Shelters
      </Button>
    );
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });

  it('fires onClick and respects disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Go</Button>);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        Go
      </Button>
    );
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('RiskBadge', () => {
  it('labels each severity distinctly', () => {
    const { rerender } = render(<RiskBadge level="low" />);
    expect(screen.getByText('Low')).toBeTruthy();
    rerender(<RiskBadge level="critical" />);
    expect(screen.getByText('Critical')).toBeTruthy();
  });
});

describe('Badge', () => {
  it('renders non-severity status text', () => {
    render(
      <Badge tone="positive" dot>
        Telemetry online
      </Badge>
    );
    expect(screen.getByText('Telemetry online')).toBeTruthy();
  });
});

describe('StatTile', () => {
  it('stays neutral when the value carries no severity', () => {
    const { container } = render(<StatTile label="Elevation" value={4.2} unit="m" />);
    const num = container.querySelector('.font-mono') as HTMLElement;
    // A measurement with no severity must not borrow a severity colour -
    // the previous tiles were permanently red or green regardless of value.
    expect(num.style.color).toBe('var(--color-fg)');
  });

  it('takes the severity colour when one applies', () => {
    const { container } = render(
      <StatTile label="Depth" value={82} unit="cm" level="critical" />
    );
    const num = container.querySelector('.font-mono') as HTMLElement;
    expect(num.style.color).toBe('var(--color-risk-critical)');
  });
});

describe('Panel', () => {
  it('associates its heading with the region', () => {
    render(
      <Panel title="Dispatch queue" eyebrow="Live">
        <p>body</p>
      </Panel>
    );
    expect(screen.getByRole('region', { name: /Dispatch queue/i })).toBeTruthy();
  });
});
