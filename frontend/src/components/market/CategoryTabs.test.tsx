/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import CategoryTabs from './CategoryTabs';

describe('CategoryTabs', () => {
  it('renders an 全部 tab plus one per category and reports clicks', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CategoryTabs categories={['product', '科技']} active="all" onChange={onChange} />);

    expect(screen.getByRole('button', { name: '全部' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '产品' }));
    expect(onChange).toHaveBeenCalledWith('product');
  });
});
