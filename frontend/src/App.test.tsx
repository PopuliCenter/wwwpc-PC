import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { LoginPage } from '@/pages/auth/LoginPage';

describe('App', () => {
  it('should render the login page', () => {
    const router = createMemoryRouter([{ path: '/login', element: <LoginPage /> }], {
      initialEntries: ['/login'],
    });

    render(<RouterProvider router={router} />);
    expect(screen.getByText('Selamat datang kembali')).toBeInTheDocument();
  });
});
