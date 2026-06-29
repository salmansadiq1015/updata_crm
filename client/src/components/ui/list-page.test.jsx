import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FileText } from 'lucide-react';
import { ListPage } from './list-page';

const empty = { icon: FileText, title: 'Nothing here' };

describe('ListPage.Body', () => {
  it('shows skeleton while loading', () => {
    render(<ListPage.Body isLoading empty={empty}><div>data</div></ListPage.Body>);
    expect(screen.queryByText('data')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing here')).not.toBeInTheDocument();
  });

  it('shows empty state when isEmpty', () => {
    render(<ListPage.Body isEmpty empty={empty}><div>data</div></ListPage.Body>);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.queryByText('data')).not.toBeInTheDocument();
  });

  it('shows children when data present', () => {
    render(<ListPage.Body empty={empty}><div>data</div></ListPage.Body>);
    expect(screen.getByText('data')).toBeInTheDocument();
  });
});

describe('ListPage.Header', () => {
  it('renders title and action', () => {
    render(<ListPage.Header title="Text Blocks" action={<button>New</button>} />);
    expect(screen.getByText('Text Blocks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });
});
