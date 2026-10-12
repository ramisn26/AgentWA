import { useState, useEffect } from 'react';
import { api } from './api.js';
import { C, FONT } from './constants.js';
import { useHashRoute } from './hooks/useHashRoute.js';
import LoginGate from './components/LoginGate.jsx';
import SetupWizard from './components/SetupWizard.jsx';
import Topbar from './components/Topbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatsPage from './components/ChatsPage.jsx';
import HomePage from './pages/HomePage.jsx';
import ChatbotBuilderPage from './pages/ChatbotBuilderPage.jsx';
import TemplateBuilderPage from './pages/TemplateBuilderPage.jsx';
import ContactsPage from './pages/ContactsPage.jsx';
import BulkMessagePage from './pages/BulkMessagePage.jsx';
import AdminSettingsPage from './pages/AdminSettingsPage.jsx';
import MediaLibraryPage from './pages/MediaLibraryPage.jsx';
import AboutUsPage from './pages/AboutUsPage.jsx';
import PipelinesPage from './pages/PipelinesPage.jsx';
import AiAgentBuilderPage from './pages/AiAgentBuilderPage.jsx';
import AppFooter from './components/AppFooter.jsx';
import CustomerHomePage from './pages/CustomerHomePage.jsx';

const VALID_PAGES = new Set([
  'home', 'chatbot-builder', 'template-builder', 'chats',
  'contacts', 'pipelines', 'bulk-message', 'admin-settings', 'media-library', 'about',
  'ai-agent-builder',
]);

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [routeParts, navigate, replaceRoute] = useHashRoute();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const page = VALID_PAGES.has(routeParts[0]) ? routeParts[0] : 'home';
  const subParts = routeParts.slice(1);
  const setPage = (p) => navigate(p);

  // Normalize empty hash to #/home so reload always shows a valid URL
  useEffect(() => {
    if (!routeParts[0]) replaceRoute('home');
  }, [routeParts, replaceRoute]);

  // Page guard: non-admins can only reach pages granted to them (user.pages).
  // admin-settings is allowed if they have any admin-settings:* sub-page.
  // Disallowed pages redirect to the user's first allowed page (Customers have
  // no Home, so they land on Chats) and are never rendered meanwhile.
  const restricted = !!user && user.role !== 'admin' && Array.isArray(user.pages);
  const pageAllowed = !restricted || (page === 'admin-settings'
    ? user.pages.some(p => p.startsWith('admin-settings'))
    : user.pages.includes(page));
  const fallbackPage = restricted
    ? (user.pages.includes('home') ? 'home' : (user.pages.find(p => VALID_PAGES.has(p)) || 'home'))
    : 'home';
  useEffect(() => {
    if (user && !pageAllowed && page !== fallbackPage) replaceRoute(fallbackPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, user, pageAllowed, fallbackPage]);

  useEffect(() => {
    // Collapse main sidebar by default on automation builder page
    if (page === 'chatbot-builder') {
      setSidebarCollapsed(true);
    }
  }, [page]);

  useEffect(() => {
    // First check whether the instance needs first-run setup (no users yet).
    // If so, show the setup wizard; otherwise resume the normal session check.
    api.auth.status()
      .then(({ setupRequired: needed }) => {
        if (needed) { setSetupRequired(true); setChecking(false); return null; }
        return api.auth.me()
          .then(({ user }) => setUser(user))
          .catch(() => setUser(null))
          .finally(() => setChecking(false));
      })
      .catch(() => {
        // status unavailable (DB warming) — fall back to a normal session check.
        api.auth.me()
          .then(({ user }) => setUser(user))
          .catch(() => setUser(null))
          .finally(() => setChecking(false));
      });
  }, []);

  const handleLogout = async () => {
    await api.auth.logout().catch(() => {});
    setUser(null);
    setPage('home');
  };

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT,
        background: C.pageBg,
      }}>
        <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 500 }}>Loading…</div>
      </div>
    );
  }

  if (setupRequired && !user) {
    return <SetupWizard onComplete={(u) => { setSetupRequired(false); setUser(u); }} />;
  }

  if (!user) {
    return <LoginGate onLogin={setUser} />;
  }

  const renderPage = () => {
    if (!pageAllowed) return null;
    switch (page) {
      case 'home': return user.role === 'customer'
        ? <CustomerHomePage user={user} onNavigate={setPage} />
        : <HomePage user={user} onPageChange={setPage} />;
      case 'chats': return <ChatsPage subParts={subParts} navigate={navigate} user={user} />;
      case 'contacts': return <ContactsPage user={user} onNavigate={navigate} />;
      case 'pipelines': return <PipelinesPage user={user} />;
      case 'template-builder': return <TemplateBuilderPage subParts={subParts} navigate={navigate} />;
      case 'media-library': return <MediaLibraryPage />;
      case 'bulk-message': return <BulkMessagePage onNavigate={navigate} user={user} />;
      case 'chatbot-builder': return <ChatbotBuilderPage subParts={subParts} navigate={navigate} />;
      case 'ai-agent-builder': return <AiAgentBuilderPage user={user} navigate={navigate} />;
      case 'about': return <AboutUsPage />;
      case 'admin-settings': return <AdminSettingsPage onLogout={handleLogout} onNavigate={setPage} subParts={subParts} navigate={navigate} user={user} />;
      default: return <HomePage user={user} onPageChange={setPage} />;
    }
  };

  // Layout: one continuous navy shell (topbar + sidebar + footer, like
  // pavirami.in) framing a light, rounded workspace canvas.
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: FONT,
      background: C.navy,
    }}>
      <Topbar user={user} onLogout={handleLogout} onNavigate={setPage} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {page !== 'admin-settings' && (
          <Sidebar
            activePage={page}
            onPageChange={setPage}
            onNavigate={navigate}
            collapsed={sidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
            user={user}
          />
        )}
        <main style={{
          flex: 1, minWidth: 0, overflow: 'auto', display: 'flex', flexDirection: 'column',
          background: C.pageBg,
          borderRadius: page !== 'admin-settings' ? '16px 0 0 16px' : '0',
          boxShadow: 'inset 0 0 0 1px rgba(7,27,53,.04)',
        }}>
          {renderPage()}
        </main>
      </div>
      <AppFooter />
    </div>
  );
}
