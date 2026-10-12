import { useEffect, useState } from 'react';
import {
  MessageCircle, Megaphone, ArrowRight, Bot, Workflow, PhoneCall, Sparkles, GraduationCap, Zap,
  Mail, Phone,
} from 'lucide-react';
import { api } from '../api.js';
import { C, FONT, BRAND_FONT } from '../constants.js';
import { BRAND } from '../brand.js';

// Landing page for Customer users (Chats + Broadcast access). It only calls
// endpoints customers are allowed to use (/numbers, /broadcasts), which the
// backend already scopes to their own WhatsApp number(s).

const SERVICES = [
  { Icon: Zap,           title: 'AI Automation',          text: 'Intelligent workflows that take repetitive business processes off your plate.' },
  { Icon: MessageCircle, title: 'WhatsApp Automation',    text: 'Leads, support, orders and bookings handled right inside WhatsApp.' },
  { Icon: PhoneCall,     title: 'AI Voice Receptionist',  text: 'Human-like voice assistants that answer calls day or night.' },
  { Icon: Workflow,      title: 'n8n Workflows',          text: 'Your CRM, email, Google Workspace and APIs, connected end to end.' },
  { Icon: Bot,           title: 'Agentic AI Solutions',   text: 'AI agents that reason, plan and carry out multi-step tasks.' },
  { Icon: GraduationCap, title: 'AI Consulting & Training', text: 'Strategy and hands-on workshops to help your team adopt AI.' },
];

function ActionCard({ Icon, title, text, stat, statLabel, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: '1 1 280px', textAlign: 'left', cursor: 'pointer', fontFamily: FONT,
        background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 16,
        padding: '22px 22px 20px', boxShadow: C.shadowSm, color: C.text,
        display: 'flex', flexDirection: 'column', gap: 14,
        transition: 'box-shadow .15s, border-color .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = C.shadowMd; e.currentTarget.style.borderColor = 'var(--c-primary)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = C.shadowSm; e.currentTarget.style.borderColor = 'var(--c-border)'; }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          width: 42, height: 42, borderRadius: 12, background: C.primaryLight, color: C.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={21} />
        </span>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{title}</span>
        {stat != null && (
          <span style={{ marginLeft: 'auto', textAlign: 'right', lineHeight: 1.1 }}>
            <span style={{ display: 'block', fontFamily: BRAND_FONT, fontSize: 22, fontWeight: 700, color: C.primary }}>{stat}</span>
            <span style={{ fontSize: 11, color: C.textMuted }}>{statLabel}</span>
          </span>
        )}
      </span>
      <span style={{ fontSize: 13.5, color: C.textSecondary, lineHeight: 1.55 }}>{text}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: C.primary }}>
        Open <ArrowRight size={15} />
      </span>
    </button>
  );
}

export default function CustomerHomePage({ user, onNavigate }) {
  const [unread, setUnread] = useState(null);
  const [broadcasts, setBroadcasts] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.numbers()
      .then(rows => { if (!cancelled) setUnread((rows || []).reduce((n, r) => n + (Number(r.unread_chats) || 0), 0)); })
      .catch(() => {});
    api.broadcasts.list()
      .then(rows => { if (!cancelled) setBroadcasts((rows || []).length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const firstName = String(user?.displayName || user?.username || '').split(' ')[0];

  return (
    <div style={{ padding: '28px 28px 40px', fontFamily: FONT, color: C.text, maxWidth: 1080, width: '100%', margin: '0 auto' }}>
      {/* Welcome banner */}
      <section style={{
        position: 'relative', overflow: 'hidden', background: C.navy, borderRadius: 20,
        padding: '30px 32px', display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap',
      }}>
        <div aria-hidden style={{
          position: 'absolute', right: '-8%', top: '-60%', width: '50%', height: '220%',
          background: 'radial-gradient(circle, rgba(0,192,240,0.16) 0%, rgba(139,108,240,0.10) 40%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', flex: '1 1 380px', minWidth: 0 }}>
          <h1 style={{ fontFamily: BRAND_FONT, fontSize: 28, fontWeight: 700, color: C.onNavy, margin: 0, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            Welcome{firstName ? `, ${firstName}` : ''}
          </h1>
          <p style={{ fontSize: 15, color: C.onNavyMuted, lineHeight: 1.6, margin: '10px 0 0', maxWidth: 520 }}>
            Your WhatsApp inbox and broadcasts live here. Reply to customers in Chats,
            or reach many at once with Bulk Message.
          </p>
        </div>
        <img src={BRAND.mark} alt="" style={{ position: 'relative', height: 92, width: 'auto', flexShrink: 0 }} />
      </section>

      {/* Quick actions */}
      <section style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '20px 0 36px' }}>
        <ActionCard
          Icon={MessageCircle}
          title="Chats"
          text="See every conversation on your WhatsApp number and reply with text, photos, documents or voice notes."
          stat={unread}
          statLabel={unread === 1 ? 'unread chat' : 'unread chats'}
          onClick={() => onNavigate('chats')}
        />
        <ActionCard
          Icon={Megaphone}
          title="Bulk Message"
          text="Send an approved template or message to many customers at once, test it first, and track delivery."
          stat={broadcasts}
          statLabel={broadcasts === 1 ? 'broadcast' : 'broadcasts'}
          onClick={() => onNavigate('bulk-message')}
        />
      </section>

      {/* About the business */}
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
        <div>
          <h2 style={{ fontFamily: BRAND_FONT, fontSize: 20, fontWeight: 700, margin: 0 }}>About {BRAND.name}</h2>
          <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.65, margin: '8px 0 0', maxWidth: 680 }}>
            We're an AI automation agency from Tamil Nadu, India. We help businesses save time and grow
            with AI agents, WhatsApp automation, voice AI and intelligent workflows. {BRAND.tagline}
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
          {SERVICES.map(({ Icon, title, text }) => (
            <div key={title} style={{
              background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 16px 15px',
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <span style={{ color: C.purple, flexShrink: 0, marginTop: 1 }}><Icon size={19} /></span>
              <span>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{title}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: C.textSecondary, lineHeight: 1.5, marginTop: 4 }}>{text}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Help / contact */}
      <section style={{
        marginTop: 28, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 16,
        padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}>
        <Sparkles size={22} style={{ color: C.primary, flexShrink: 0 }} />
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Need a new template, automation or help?</div>
          <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 3 }}>Our team is happy to set it up for you.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href="https://wa.me/919095290768" target="_blank" rel="noopener noreferrer" style={contactBtn(true)}>
            <MessageCircle size={15} /> WhatsApp us
          </a>
          <a href="mailto:contact@pavirami.in" style={contactBtn(false)}><Mail size={15} /> Email</a>
          <a href="tel:+919095290768" style={contactBtn(false)}><Phone size={15} /> Call</a>
        </div>
      </section>
    </div>
  );
}

function contactBtn(primary) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10,
    fontSize: 13, fontWeight: 700, textDecoration: 'none', fontFamily: FONT,
    background: primary ? C.primary : C.cardBg,
    color: primary ? '#fff' : C.text,
    border: primary ? 'none' : `1px solid ${C.border}`,
  };
}
