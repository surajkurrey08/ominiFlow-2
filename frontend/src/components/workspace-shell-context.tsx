"use client";

import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

export interface WorkspaceShellValue {
  fullName: string;
  initials: string;
  inboxTotal: number | null;
  sidebarCollapsed: boolean;
  mobileNavigationOpen: boolean;
  setInboxTotal: Dispatch<SetStateAction<number | null>>;
  toggleNavigation: () => void;
  logout: () => Promise<void>;
}

export const WorkspaceShellContext = createContext<WorkspaceShellValue | null>(null);

export function useWorkspaceShell() {
  return useContext(WorkspaceShellContext);
}
