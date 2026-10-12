import { useState } from 'react';
import { Lock, LogIn, Eye, EyeOff } from 'lucide-react';
import { api } from '../api.js';
import { C, FONT, BRAND_FONT } from '../constants.js';
import { BRAND } from '../brand.js';

export default function LoginGate({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password required.'); return; }
    setError('');
    setLoading(true);
    try {
      const { user } = await api.auth.login(email, password);
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      width: '100%',
      height: '100%',
      fontFamily: FONT,
    }}>
      {/* Left brand panel — navy, mirroring pavirami.in */}
      <div className="login-brand-panel" style={{
        flex: 1,
        minWidth: 0,
        background: C.navy,
        display: 'flex',
        flexDirection: 'column',
        padding: '40px 64px 28px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Soft glow in the mark's cyan and violet */}
        <div aria-hidden style={{
          position: 'absolute', top: '-18%', right: '-14%', width: '62%', height: '62%',
          background: 'radial-gradient(circle, rgba(0,192,240,0.16) 0%, transparent 68%)', pointerEvents: 'none',
        }} />
        <div aria-hidden style={{
          position: 'absolute', bottom: '-22%', left: '-12%', width: '56%', height: '56%',
          background: 'radial-gradient(circle, rgba(139,108,240,0.16) 0%, transparent 68%)', pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 520 }}>
          <img
            src={BRAND.logo}
            alt={BRAND.name}
            style={{ width: 300, maxWidth: '80%', height: 'auto', marginBottom: 36, marginLeft: -8 }}
          />
          <h1 style={{
            fontFamily: BRAND_FONT,
            fontSize: 38,
            fontWeight: 700,
            color: C.onNavy,
            letterSpacing: '-0.02em',
            lineHeight: 1.18,
            margin: '0 0 18px',
          }}>
            Every WhatsApp conversation, one calm inbox.
          </h1>
          <p style={{ fontSize: 16, color: C.onNavyMuted, lineHeight: 1.65, margin: 0, maxWidth: 460 }}>
            Reply to customers, send broadcasts and let AI agents handle the routine —
            built and supported by {BRAND.name}.
          </p>
        </div>

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 18, fontSize: 12, color: C.onNavyMuted }}>
          <span>
            Powered by <a href={BRAND.website} target="_blank" rel="noopener noreferrer"
              style={{ color: C.onNavy, fontFamily: BRAND_FONT, fontWeight: 700, textDecoration: 'none' }}>{BRAND.poweredBy}</a>
          </span>
          <span style={{ opacity: .4 }}>·</span>
          {BRAND.socials.map(soc => (
            <a key={soc.key} href={soc.href} target="_blank" rel="noopener noreferrer"
              style={{ color: C.onNavyMuted, textDecoration: 'none' }}>{soc.label}</a>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="login-form-panel" style={{
        width: '100%',
        maxWidth: 540,
        minWidth: 360,
        background: C.pageBg,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '40px 48px',
        overflowY: 'auto',
      }}>
        <div style={{
          width: '100%',
          maxWidth: 400,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Lock size={14} color={C.primary} />
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.primary,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              Sign In
            </span>
          </div>
          <h2 style={{
            fontSize: 24,
            fontWeight: 700,
            color: C.text,
            marginBottom: 28,
            letterSpacing: '-0.02em',
          }}>
            Welcome back
          </h2>

          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', marginBottom: 18 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.textSecondary,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}>
                Email
              </div>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: `1.5px solid ${C.border}`,
                  fontSize: 14,
                  fontFamily: FONT,
                  outline: 'none',
                  background: C.cardBg,
                  color: C.text,
                  transition: 'border .15s',
                }}
                onFocus={e => (e.target.style.borderColor = C.purple)}
                onBlur={e => (e.target.style.borderColor = C.border)}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 24 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.textSecondary,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}>
                Password
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 38px 11px 14px',
                    borderRadius: 10,
                    border: `1.5px solid ${C.border}`,
                    fontSize: 14,
                    fontFamily: FONT,
                    outline: 'none',
                    background: C.cardBg,
                    color: C.text,
                    transition: 'border .15s',
                  }}
                  onFocus={e => (e.target.style.borderColor = C.purple)}
                  onBlur={e => (e.target.style.borderColor = C.border)}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: C.textSecondary,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && (
              <div style={{
                background: '#FDECEE',
                color: '#A3202B',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                marginBottom: 16,
                fontWeight: 500,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 10,
                border: 'none',
                background: C.primary,
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontFamily: FONT,
                transition: 'opacity .15s, background .15s',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = C.primaryHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.primary; }}
            >
              <LogIn size={16} />
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>

      {/* Responsive: hide brand panel on small screens */}
      <style>{`
        @media (max-width: 900px) {
          .login-brand-panel { display: none !important; }
        }
        @media (max-width: 900px) {
          .login-form-panel { max-width: 100% !important; padding: 24px !important; }
        }
      `}</style>
    </div>
  );
}
