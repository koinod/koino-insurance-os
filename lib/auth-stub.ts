// Auth stub — hardcoded session for demo. Replace with NextAuth + magic link.
// TODO: install next-auth, configure email provider, replace usage of getSession().

import { Role } from "./types";

export interface Session {
  email: string;
  name: string;
  role: Role;
  org: string;
}

export function getSession(): Session {
  return {
    email: process.env.AUTH_STUB_EMAIL ?? "ian@koinocapital.com",
    name: "Ian Meeks",
    role: (process.env.AUTH_STUB_ROLE as Role) ?? "OWNER",
    org: "KOINO Capital",
  };
}
