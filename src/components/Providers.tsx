'use client';
import { ReactNode } from 'react';
import { RoleProvider } from '@/lib/role-context';

export function Providers({ children }: { children: ReactNode }) {
  return <RoleProvider>{children}</RoleProvider>;
}
