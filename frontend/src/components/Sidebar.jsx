import {
  Home, Zap, LayoutTemplate, MessageCircle, Users,
  Megaphone, Image as ImageIcon, Info, KanbanSquare, Bot, Phone,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { C, FONT } from '../constants.js';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'chatbot-builder', label: 'Automations', Icon: Zap },
  { id: 'ai-agent-builder', label: 'AI Agents', Icon: Bot },
  // Lives in Settings → WhatsApp Accounts; surfaced here so it isn't buried.
  { id: 'whatsapp-numbers', label: 'WhatsApp Numbers', Icon: Phone, to: ['admin-settings', 'whatsapp-accounts'], pageKey: 'admin-settings:whatsapp-accounts' },
  { id: 'template-builder', label: 'Template Builder', Icon: LayoutTemplate },
  { id: 'media-library', label: 'Media', Icon: ImageIcon },
  { id: 'chats', label: 'Chats', Icon: MessageCircle },
  { id: 'contacts', label: 'Contacts', Icon: Users },
  { id: 'pipelines', label: 'Pipelines', Icon: KanbanSquare },
  { id: 'bulk-message', label: 'Bulk Message', Icon: Megaphone },
  { id: 'about', label: 'About Us', Icon: Info },
];

export default function Sidebar({ activePage, onPageChange, onNavigate, collapsed, setCollapsed, user }) {
  // Admins see every nav item; other roles see only the pages granted to them
  // (user.pages from the session). Falls back to all items if pages is missing.
  const visibleItems = (user?.role === 'admin' || !Array.isArray(user?.pages))
    ? NAV_ITEMS
    : NAV_ITEMS.filter(item => user.pages.includes(item.pageKey || item.id));
  return (
    <nav
      className="pr-shell-scroll"
      aria-label="Main"
      style={{
        width: collapsed ? 72 : 232,
        minHeight: '100%',
        background: C.navy,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width .25s ease',
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: collapsed ? '14px 10px' : '14px 12px', flex: 1 }}>
        {!collapsed && (
          <div style={{
            padding: '4px 12px 10px', fontSize: 11, fontWeight: 600, color: C.onNavyMuted,
            fontFamily: FONT, letterSpacing: '.02em',
          }}>
            Workspace
          </div>
        )}
        {visibleItems.map(item => {
          const active = activePage === item.id
            || (item.to && activePage === item.to[0] && item.id === 'whatsapp-numbers');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => (item.to && onNavigate ? onNavigate(...item.to) : onPageChange(item.id))}
              title={collapsed ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
              style={{
                position: 'relative',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: collapsed ? 0 : 12,
                padding: collapsed ? '11px 0' : '10px 12px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                transition: 'background .15s, color .15s',
                marginBottom: 3,
                background: active ? C.navyRaised : 'transparent',
                color: active ? '#fff' : C.onNavyMuted,
                justifyContent: collapsed ? 'center' : 'flex-start',
                fontFamily: FONT,
                fontSize: 13.5,
                fontWeight: active ? 700 : 500,
                whiteSpace: 'nowrap',
                textAlign: 'left',
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(140,180,230,.08)'; e.currentTarget.style.color = C.onNavy; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.onNavyMuted; } }}
            >
              {/* Brand-gradient rail marks the current page */}
              {active && (
                <span aria-hidden style={{
                  position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
                  borderRadius: 3, background: C.brandGradient,
                }} />
              )}
              <span style={{
                width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                color: active ? C.brandCyan : 'inherit',
              }}>
                <item.Icon size={17} strokeWidth={active ? 2.3 : 2} />
              </span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setCollapsed(p => !p)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '14px 0' : '14px 22px',
          border: 'none', borderTop: `1px solid ${C.navyLine}`,
          background: 'transparent', color: C.onNavyMuted, cursor: 'pointer',
          fontFamily: FONT, fontSize: 13, fontWeight: 600,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = C.onNavy; }}
        onMouseLeave={e => { e.currentTarget.style.color = C.onNavyMuted; }}
      >
        {collapsed ? <ChevronRight size={18} strokeWidth={2.4} /> : <ChevronLeft size={18} strokeWidth={2.4} />}
        {!collapsed && 'Collapse'}
      </button>
    </nav>
  );
}
