'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Role = 'owner' | 'manager' | 'rep';

const RoleContext = createContext<{ role: Role; setRole: (r: Role) => void }>({
  role: 'owner',
  setRole: () => {},
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>('owner');

  useEffect(() => {
    const saved = localStorage.getItem('koino_role') as Role;
    if (saved) setRoleState(saved);
  }, []);

  function setRole(r: Role) {
    setRoleState(r);
    localStorage.setItem('koino_role', r);
  }

  return (
    <RoleContext.Provider value={{ role, setRole }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
