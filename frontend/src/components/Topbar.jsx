import { useState, useRef, useEffect } from 'react';
import { Info, LogOut, Settings, AlertTriangle } from 'lucide-react';
import { C, FONT, BRAND_FONT } from '../constants.js';
import { BRAND } from '../brand.js';
import { api } from '../api.js';

const ROLE_TITLE = { admin: 'Owner', bda_sales: 'Sales', customer: 'Customer', viewer: 'Viewer' };

export default function Topbar({ user, onLogout, onNavigate }) {
  // Settings / About only for roles that can actually open them. Customers
  // (Chats + Bulk Message only) never see links that would just bounce them.
  const pages = Array.isArray(user?.pages) ? user.pages : null;
  const isAdmin = user?.role === 'admin' || !pages;
  const canSettings = isAdmin || pages.some(p => p.startsWith('admin-settings'));
  const canAbout = isAdmin || pages.includes('about');
  const [userOpen, setUserOpen] = useState(false);
  const [unhealthyAccounts, setUnhealthyAccounts] = useState([]);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setUserOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Poll account health every 60s so the banner appears within a minute
  // of Meta rejecting a token. Cleared instantly when token is updated.
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      api.whatsappAccounts.list()
        .then(accs => { if (!cancelled) setUnhealthyAccounts(accs.filter(a => a.healthStatus === 'invalid_token')); })
        .catch(() => {});
    };
    check();
    const t = setInterval(check, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <>
    {canSettings && unhealthyAccounts.length > 0 && (
      <div
        onClick={() => onNavigate('admin-settings')}
        style={{
          background: C.danger, color: '#fff', padding: '8px 16px',
          fontSize: 12, fontFamily: FONT, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 8, cursor: 'pointer', fontWeight: 500,
        }}
      >
        <AlertTriangle size={14} />
        <span>
          Access token expired for {unhealthyAccounts.map(a => a.displayName).join(', ')} — click to update in Settings → WhatsApp Accounts
        </span>
      </div>
    )}
    <div style={{
      height: 60,
      background: C.headerBg,
      display: 'flex',
      alignItems: 'center',
      paddingLeft: 0,
      paddingRight: 20,
      flexShrink: 0,
      zIndex: 100,
      position: 'relative',
    }}>
      {/* Brand lockup — aligns with the sidebar */}
      <button
        type="button"
        onClick={() => onNavigate('chats')}
        title={BRAND.name}
        style={{
          width: 232, flexShrink: 0, height: '100%',
          display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 16,
          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <img
          src={BRAND.mark}
          alt=""
          style={{ height: 30, width: 'auto', flexShrink: 0 }}
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
        <span style={{ lineHeight: 1.15, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: BRAND_FONT, fontSize: 15, fontWeight: 700, color: C.onNavy, letterSpacing: '-.005em', whiteSpace: 'nowrap' }}>
            {BRAND.name}
          </span>
          <span style={{ display: 'block', fontFamily: BRAND_FONT, fontSize: 10, fontWeight: 500, color: C.onNavyMuted, marginTop: 2, whiteSpace: 'nowrap' }}>
            {BRAND.tagline}
          </span>
        </span>
      </button>

      <div style={{ flex: 1 }} />

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* About Us */}
        {canAbout && <button
          onClick={() => onNavigate('about')}
          title="About Us"
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: C.headerSurface,
            border: `1.5px solid ${C.headerBorder}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Info size={16} color={C.headerText} />
        </button>}

        {/* User avatar */}
        <div ref={ref} style={{ position: 'relative' }}>
          <button
            onClick={() => setUserOpen(p => !p)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: C.brandGradient,
              border: userOpen ? '2px solid #fff' : `1.5px solid ${C.headerBorder}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              fontFamily: FONT,
              transition: 'border .15s',
              padding: 0,
              overflow: 'hidden',
            }}
          >
            {(user.displayName || user.username).charAt(0).toUpperCase()}
          </button>

          {userOpen && (
            <div style={{
              position: 'absolute',
              top: 44,
              right: 0,
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              boxShadow: C.shadowMd,
              padding: 6,
              minWidth: 180,
              zIndex: 200,
            }}>
              <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                  {user.displayName || user.username}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  {ROLE_TITLE[user.role] || 'Owner'}
                </div>
              </div>
              {canSettings && <button
                onClick={() => { setUserOpen(false); onNavigate('admin-settings'); }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: C.text,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: FONT,
                  marginBottom: 4,
                }}
              >
                <Settings size={14} />
                Settings
              </button>}
              <button
                onClick={() => { setUserOpen(false); onLogout(); }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: C.primary,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: FONT,
                }}
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
