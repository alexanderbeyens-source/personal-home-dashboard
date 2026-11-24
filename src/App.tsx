import { useEffect, useState } from "react";
import { Brand, currentPath, type AuthUser, type PageProps } from "./components/AppShell";
import { Icon } from "./components/Icon";
import { BriefingPage } from "./pages/BriefingPage";
import { Dashboard } from "./pages/Dashboard";
import { EconomyPage } from "./pages/EconomyPage";
import { NewsPage } from "./pages/NewsPage";
import { SportPage } from "./pages/SportPage";
import { WeatherPage } from "./pages/WeatherPage";

type AccessState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unauthenticated"; csrfToken: string }
  | { status: "authenticated"; csrfToken: string; user: AuthUser };

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Brand />
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

function Page(props: PageProps) {
  const path = currentPath();
  if (path === "/briefing") return <BriefingPage {...props} />;
  if (path === "/news" || path === "/nieuws") return <NewsPage {...props} />;
  if (path === "/sport" || path.startsWith("/sport/")) return <SportPage {...props} />;
  if (path === "/economie") return <EconomyPage {...props} />;
  if (path === "/weer") return <WeatherPage {...props} />;
  return <Dashboard {...props} />;
}

function App() {
  const [access, setAccess] = useState<AccessState>({ status: "loading" });
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadAccess = async () => {
      try {
        const [sessionResponse, csrfResponse] = await Promise.all([
          fetch("/api/auth/session", { cache: "no-store" }),
          fetch("/api/auth/csrf", { cache: "no-store" }),
        ]);
        if (!sessionResponse.ok || !csrfResponse.ok) {
          throw new Error("Aanmelden is niet beschikbaar. Controleer de authenticatie-instellingen van de server.");
        }
        const [session, csrf] = await Promise.all([
          sessionResponse.json() as Promise<{ user?: AuthUser } | null>,
          csrfResponse.json() as Promise<{ csrfToken?: string }>,
        ]);
        if (!csrf.csrfToken) throw new Error("Kon geen beveiligde aanmeldsessie starten.");
        if (!active) return;
        if (session?.user?.id) {
          setAccess({ status: "authenticated", csrfToken: csrf.csrfToken, user: session.user });
        } else {
          setAccess({ status: "unauthenticated", csrfToken: csrf.csrfToken });
        }
      } catch (error) {
        if (active) {
          setAccess({
            status: "error",
            message: error instanceof Error ? error.message : "Kon de aanmelding niet controleren.",
          });
        }
      }
    };

    void loadAccess();
    const onExpired = () => {
      setAccess((current) =>
        current.status === "authenticated"
          ? { status: "unauthenticated", csrfToken: current.csrfToken }
          : current,
      );
    };
    window.addEventListener("northstar:session-expired", onExpired);
    return () => {
      active = false;
      window.removeEventListener("northstar:session-expired", onExpired);
    };
  }, []);

  async function signOut(csrfToken: string) {
    setSignOutError(null);
    try {
      const response = await fetch("/api/auth/signout", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken, callbackUrl: window.location.origin }),
      });
      if (!response.ok) throw new Error("Afmelden mislukt. Probeer het opnieuw.");
      window.location.assign("/");
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Afmelden mislukt.");
    }
  }

  if (access.status === "loading") {
    return <main className="auth-page"><div className="auth-card"><span className="loader" />Aanmelding controleren…</div></main>;
  }

  if (access.status === "error") {
    return (
      <AuthCard title="Aanmelden niet beschikbaar">
        <p className="auth-description">{access.message}</p>
      </AuthCard>
    );
  }

  if (access.status === "unauthenticated") {
    return (
      <AuthCard title="Privédashboard">
        <p className="auth-description">Meld je aan met het GitHub-account dat toegang heeft tot dit dashboard.</p>
        <a className="button-primary" href="/api/auth/signin">Doorgaan met GitHub <Icon name="arrow" size={16} /></a>
        <p className="auth-note">Alleen het ingestelde account heeft toegang tot de dashboardgegevens.</p>
      </AuthCard>
    );
  }

  return <Page user={access.user} csrfToken={access.csrfToken} signOutError={signOutError} onSignOut={signOut} />;
}

export default App;
