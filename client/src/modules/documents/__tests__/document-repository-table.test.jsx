import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { DocumentRepositoryTable } from '../components/document-repository-table';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (key, fallback, vars) => {
      const values = {
        'common.preview': 'Preview',
        'common.download': 'Download',
        'common.delete': 'Delete',
        'documents.repository.emptyDescription': 'Upload or generate documents, then link them to customers, projects, jobs, or employees.',
        'documents.repository.emptyTitle': 'No documents found',
        'documents.repository.loadFailed': 'Documents could not be loaded.',
        'documents.repository.source.repository': 'Repository',
        'documents.repository.link.project': 'Project',
      };
      const value = values[key] || fallback || key;
      return typeof value === 'string' && vars
        ? value.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`))
        : value;
    },
  }),
}));

const documents = [
  {
    id: 'repository:665000000000000000000001',
    source: 'repository',
    sourceLabel: 'Repository',
    origin: 'uploaded',
    title: 'Signed installation contract',
    fileName: 'contract.pdf',
    documentType: 'CONTRACT',
    category: 'PROJECT',
    projectId: '665000000000000000000111',
    createdAt: '2026-06-17T09:30:00.000Z',
    fileSizeBytes: 2048,
    canDelete: true,
  },
];

describe('DocumentRepositoryTable', () => {
  test('renders normalized documents and delegates row actions', () => {
    const onPreview = vi.fn();
    const onDownload = vi.fn();
    const onDelete = vi.fn();

    render(
      <DocumentRepositoryTable
        documents={documents}
        onPreview={onPreview}
        onDownload={onDownload}
        onDelete={onDelete}
        canDelete
      />,
    );

    expect(screen.getByText('Signed installation contract')).toBeInTheDocument();
    expect(screen.getByText('Repository')).toBeInTheDocument();
    expect(screen.getByText('CONTRACT')).toBeInTheDocument();
    expect(screen.getByText(/Project:/)).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Preview'));
    fireEvent.click(screen.getByTitle('Download'));
    fireEvent.click(screen.getByTitle('Delete'));

    expect(onPreview).toHaveBeenCalledWith(documents[0]);
    expect(onDownload).toHaveBeenCalledWith(documents[0]);
    expect(onDelete).toHaveBeenCalledWith(documents[0]);
  });

  test('shows an explicit empty state', () => {
    render(<DocumentRepositoryTable documents={[]} />);
    expect(screen.getByText('No documents found')).toBeInTheDocument();
  });

  test('shows an explicit error state', () => {
    render(<DocumentRepositoryTable error={{ message: 'Request failed' }} />);
    expect(screen.getByText('Documents could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('Request failed')).toBeInTheDocument();
  });
});
