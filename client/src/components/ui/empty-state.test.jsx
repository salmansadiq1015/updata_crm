import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FileText } from 'lucide-react';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    render(
      <EmptyState
        icon={FileText}
        title="No text blocks found"
        description="Create your first block"
        action={<button>Create</button>}
      />,
    );
    expect(screen.getByText('No text blocks found')).toBeInTheDocument();
    expect(screen.getByText('Create your first block')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('renders without optional props', () => {
    render(<EmptyState icon={FileText} title="Empty" />);
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });
});
