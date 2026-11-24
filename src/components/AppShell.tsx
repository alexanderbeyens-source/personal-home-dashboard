import type { ReactNode } from "react";

export interface AuthUser {
  id: string;
  name?: string | null;
}

export interface PageProps {
  user: AuthUser;
  csrfToken: string;
  signOutError: string | null;
  onSignOut: (csrfToken: string) => void;
}

const NAV_ITEMS = [
  { href: "/", label: "Overzicht" },
  { href: "/briefing", label: "Briefing" },
  { href: "/news", label: "Nieuws" },
  { href: "/sport", label: "Sport" },
  { href: "/economie", label: "Economie" },
  { href: "/weer", label: "Weer" },
] as const;

export function currentPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

function isActive(href: string, path: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Northstar overzicht">
      <span className="brand-mark" aria-hidden="true" />
      <span className="brand-name">northstar</span>
    </a>
  );
}

export function AppShell({
  user,
  csrfToken,
  signOutError,
  onSignOut,
  title,
  intro,
  children,
}: PageProps & { title: string; intro?: ReactNode; children: ReactNode }) {
  const path = currentPath();
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <Brand />
          <nav className="main-nav" aria-label="Hoofdnavigatie">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`nav-link${isActive(item.href, path) ? " is-active" : ""}`}
                aria-current={isActive(item.href, path) ? "page" : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="account">
            <span className="account-name">{user.name || "Aangemeld"}</span>
            <button className="button-ghost" type="button" onClick={() => onSignOut(csrfToken)}>Afmelden</button>
          </div>
        </div>
      </header>
      {signOutError && <p className="page-alert" role="alert">{signOutError}</p>}
      <main className="page">
        <div className="page-heading">
          <h1>{title}</h1>
          {intro && <div className="page-intro">{intro}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}
