import { Menu, Moon, Sun, X } from 'lucide-react';
import { useState } from 'react';
import type { ActiveTab } from '../types/app.ts';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  userEmail: string | null;
  userName: string | null;
  onAuthClick: () => void;
}

const NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'catalog', label: 'Catalog' },
  { id: 'automated', label: 'Automated' },
  { id: 'forex', label: 'Forex & MT5' },
  { id: 'charts', label: 'Live Charts' },
  { id: 'settings', label: 'Settings' },
];

export function Navbar({
  activeTab,
  onTabChange,
  theme,
  onToggleTheme,
  userEmail,
  userName,
  onAuthClick,
}: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const accountLabel = userName
    ? userName.split(' ')[0].slice(0, 14)
    : userEmail
      ? userEmail.split('@')[0].slice(0, 14)
      : 'Sign in';

  return (
    <header className="sticky top-0 z-40 border-b border-[#E0E3EB] bg-white/95 backdrop-blur-md dark:border-[#1E222D] dark:bg-black/95">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => onTabChange('catalog')}
          className="font-display text-base font-bold tracking-tight text-[#131722] dark:text-[#F0F3FA] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF] rounded"
        >
          TRADERSPRO254
        </button>

        {/* Zone 2: Primary Navigation Links */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`relative py-2 text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF] rounded ${
                  isActive
                    ? 'text-[#2962FF] dark:text-[#2962FF]'
                    : 'text-[#5D606B] hover:text-[#131722] dark:text-[#787B86] dark:hover:text-[#D1D4DC]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute inset-x-0 -bottom-[9px] h-0.5 bg-[#2962FF]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Theme Toggle & Account Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#E0E3EB] bg-[#F8FAFD] text-[#131722] transition-colors hover:bg-[#F0F3FA] dark:border-[#1E222D] dark:bg-[#0D1017] dark:text-[#D1D4DC] dark:hover:bg-[#131722] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF]"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onAuthClick}
            className="inline-flex h-9 items-center rounded-md bg-[#2962FF] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#1E53E5] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2962FF]"
          >
            {accountLabel}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#E0E3EB] text-[#131722] md:hidden dark:border-[#1E222D] dark:text-[#D1D4DC]"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      {mobileOpen && (
        <nav
          className="border-t border-[#E0E3EB] bg-white px-4 py-3 md:hidden dark:border-[#1E222D] dark:bg-black"
          aria-label="Mobile navigation"
        >
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onTabChange(item.id);
                    setMobileOpen(false);
                  }}
                  className={`flex h-10 items-center rounded-md px-3 text-left text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#2962FF]/10 text-[#2962FF]'
                      : 'text-[#5D606B] hover:bg-[#F0F3FA] dark:text-[#9598A1] dark:hover:bg-[#0D1017]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
