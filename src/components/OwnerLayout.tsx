import React from 'react';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';
import { Building, LogOut } from 'lucide-react';

interface OwnerLayoutProps {
  ownerName: string;
  children: React.ReactNode;
}

export default function OwnerLayout({ ownerName, children }: OwnerLayoutProps) {
  const { logout } = useAuth();
  const { companyName } = useCompany();

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col text-brand-text antialiased selection:bg-brand-primary/10">
      {/* Agent Workspace Standalone Header */}
      <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-brand-gray-border bg-brand-card px-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-primary text-brand-accent flex items-center justify-center font-bold shadow-md">
            {companyName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="font-sans text-sm font-bold tracking-tight text-brand-primary leading-none uppercase">{companyName}</h1>
            <p className="font-mono text-[9px] tracking-widest text-brand-text-variant uppercase font-semibold mt-0.5">Agent Portal</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline font-sans text-xs font-semibold text-brand-text-variant">
            Agent: <strong className="text-brand-text">{ownerName}</strong>
          </span>
          <button 
            onClick={logout}
            className="rounded-xl border border-brand-gray-border bg-brand-card hover:bg-brand-gray-hover px-4 py-2 font-sans text-xs font-bold text-brand-primary transition-all cursor-pointer"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* Standalone Agent Profile Content */}
      <main className="flex-1 overflow-y-auto focus:outline-none">
        {children}
      </main>
    </div>
  );
}
