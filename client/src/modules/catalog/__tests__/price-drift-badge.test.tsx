import { render, screen } from '@testing-library/react';
import { PriceDriftBadge } from '../components/price-drift-badge';

describe('PriceDriftBadge', () => {
  it('renders nothing when prices are equal', () => {
    const { container } = render(
      <PriceDriftBadge snapshotPrice={100} currentPrice={100} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when currentPrice is null', () => {
    const { container } = render(
      <PriceDriftBadge snapshotPrice={100} currentPrice={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows positive drift with + sign', () => {
    render(<PriceDriftBadge snapshotPrice={100} currentPrice={110} />);
    expect(screen.getByText(/\+10\.0%/)).toBeInTheDocument();
  });

  it('shows negative drift without + sign', () => {
    render(<PriceDriftBadge snapshotPrice={100} currentPrice={90} />);
    expect(screen.getByText(/-10\.0%/)).toBeInTheDocument();
  });
});
