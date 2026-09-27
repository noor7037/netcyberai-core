'use client';

import './wa-phone.css';
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/lib/hooks';
import {
  PARENT_ACTION_REPLIES,
  PARENT_CHAT,
  PARENT_MENU,
  RECEIPT_LINES,
  ROLE_CHATS,
  TEACHERS,
  TEACHER_FOCUS,
  TEACHER_QUESTION,
  UNDERSTANDING,
  type Bi,
  type ChatBlock,
  type ChatMsg,
  type RoleChatId,
} from '@/demo-fixture/whatsapp-chats';

// The founder's parent WhatsApp phone, ported whole: every message and
// action of the reference works here (understanding replies, notes,
// homework follow-up, teacher ratings, PTM, fee payment with a demo PDF
// receipt, celebration, certificate, sharing). Other roles reuse the same
// phone. The chat scrolls itself slowly; hovering, touching, scrolling or
// tapping holds it, and a tap on the chat background toggles it. Fixture
// data only: nothing is sent or saved.

const SPEED = 16; // px per second: slow enough to read along
const HOLD_AFTER_TOUCH = 7000;

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

function BiText({ bi }: { bi: Bi }) {
  return (
    <>
      <p>
        <Rich text={bi.en} />
      </p>
      {bi.hi && (
        <p className="hi">
          <Rich text={bi.hi} />
        </p>
      )}
    </>
  );
}

type Appended = { id: number; msg: ChatMsg } | { id: number; typing: true };

function receiptPdf(lines: string[]): Blob {
  const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let content = `BT /F1 18 Tf 54 760 Td (${esc(lines[0])}) Tj ET\n`;
  content += `BT /F1 11 Tf 54 730 Td (${esc(lines[1])}) Tj ET\n`;
  let y = 695;
  for (let i = 2; i < lines.length; i++) {
    content += `BT /F1 11 Tf 54 ${y} Td (${esc(lines[i])}) Tj ET\n`;
    y -= 32;
  }
  const objs = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
    '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>endobj',
    '4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
    `5 0 obj<< /Length ${content.length} >>stream\n${content}endstream endobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const o of objs) {
    offsets.push(pdf.length);
    pdf += `${o}\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

function download(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

export function WhatsAppPhone({ role = 'parents', className = '' }: { role?: RoleChatId; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const chatRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [playing, setPlaying] = useState(true);
  const [held, setHeld] = useState(false);
  const hover = useRef(false);
  const holdUntil = useRef(0);
  const visible = useRef(true);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  // Parent chat state.
  const [choice, setChoice] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [openTeacher, setOpenTeacher] = useState<number | null>(null);
  const [stars, setStars] = useState(0);
  const [focus, setFocus] = useState('');
  const [qtype, setQtype] = useState('');
  const [tpNote, setTpNote] = useState('');
  const [appended, setAppended] = useState<Appended[]>([]);
  const [overlay, setOverlay] = useState<null | 'share' | 'cert' | 'menu'>(null);
  const [shareTitle, setShareTitle] = useState('');
  const [input, setInput] = useState('');
  const nextId = useRef(1);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2600);
  }, []);

  const hold = (ms = HOLD_AFTER_TOUCH) => {
    holdUntil.current = performance.now() + ms;
  };

  // Reset when the audience changes.
  useEffect(() => {
    setAppended([]);
    setChoice(null);
    setOverlay(null);
    setOpenTeacher(null);
    chatRef.current?.scrollTo({ top: 0 });
  }, [role]);

  // Auto-scroll: slow, only while on screen, never under the pointer,
  // paused for a few seconds after any touch or manual scroll, looping
  // back to the top after a short rest at the end.
  useEffect(() => {
    const el = chatRef.current;
    if (!el || reduced || !playing) return;
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let restSince = 0;
    const step = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      if (!hover.current && t > holdUntil.current && visible.current && document.visibilityState === 'visible' && !overlay) {
        const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
        if (atEnd) {
          if (!restSince) restSince = t;
          else if (t - restSince > 3500) {
            el.scrollTo({ top: 0, behavior: 'smooth' });
            restSince = 0;
            holdUntil.current = t + 2500;
          }
        } else {
          restSince = 0;
          acc += (SPEED * dt) / 1000;
          if (acc >= 1) {
            const whole = Math.floor(acc);
            el.scrollTop += whole;
            acc -= whole;
          }
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [reduced, playing, overlay, role]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const scrollBottom = () => {
    hold(9000);
    requestAnimationFrame(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: reduced ? 'auto' : 'smooth' }));
  };

  // Parent line now; school answers after a short "typing" beat.
  const exchange = (parentText?: string, school?: { label: string; text: string }) => {
    const add: Appended[] = [];
    if (parentText) add.push({ id: nextId.current++, msg: { k: 'parent', text: { en: parentText }, meta: 'Parent · now' } });
    if (school) add.push({ id: nextId.current++, typing: true });
    setAppended((a) => [...a, ...add]);
    scrollBottom();
    if (school) {
      const typingId = add[add.length - 1].id;
      setTimeout(() => {
        setAppended((a) => a.map((x) => (x.id === typingId ? { id: typingId, msg: { k: 'school', label: school.label, paras: [{ en: school.text }], meta: 'Delivered now' } } : x)));
        scrollBottom();
      }, 650);
    }
  };

  const onAction = (id: string, label: string) => {
    hold(9000);
    if (role !== 'parents') {
      toast(`Demo: “${label.replace(/^[^A-Za-z]+/, '')}” · nothing is sent.`);
      return;
    }
    const scripted = PARENT_ACTION_REPLIES[id];
    if (scripted) {
      if (scripted.parent || scripted.school) exchange(scripted.parent, scripted.school);
      if (scripted.toast) toast(scripted.toast);
      return;
    }
    switch (id) {
      case 'ptm-question':
        setNote('Can we discuss Rahul’s Mathematics reasoning progress in the PTM?');
        chatRef.current?.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
        setTimeout(() => noteRef.current?.focus(), 400);
        toast('PTM question prepared in the note box.');
        break;
      case 'share-achievement':
        setShareTitle('Share Rahul’s Top 3 achievement');
        setOverlay('share');
        break;
      case 'share-certificate':
        setShareTitle('Share Rahul’s progress certificate');
        setOverlay('share');
        break;
      case 'view-certificate':
      case 'download-certificate':
        setOverlay('cert');
        break;
      case 'download-receipt': {
        const url = URL.createObjectURL(receiptPdf(RECEIPT_LINES));
        download(url, 'Demo_Sunrise_International_Rahul_Sharma_Fee_Receipt.pdf');
        setTimeout(() => URL.revokeObjectURL(url), 800);
        toast('Demo PDF receipt downloaded.');
        break;
      }
      case 'open-menu':
        setOverlay('menu');
        break;
      default:
        toast('Demo action.');
    }
  };

  const chooseUnderstanding = (i: number) => {
    hold(9000);
    setChoice(i);
    toast('Response recorded and sent to school.');
  };

  const sendNote = () => {
    const n = note.trim();
    if (!n) return toast('Write a short note first.');
    exchange(`**Parent note:** ${n}`, { label: '✓ SCHOOL ACKNOWLEDGED', text: 'Thanks for sharing this. The school team has received your note and can route it to the relevant teacher or coordinator.' });
    setNote('');
    toast('Parent note sent to school.');
  };

  const sendTeacherFeedback = () => {
    if (openTeacher === null) return toast('Select a teacher first.');
    if (!stars) return toast('Please choose a rating.');
    const t = TEACHERS[openTeacher];
    const f = focus || 'General feedback';
    exchange(`**Feedback for ${t.name}:** ${stars}/5 · ${f}${tpNote.trim() ? ` · ${tpNote.trim()}` : ''}`, {
      label: '✓ FEEDBACK ROUTED',
      text: `Your feedback for ${t.name} has been shared with the teacher and logged in the school dashboard.`,
    });
    setOpenTeacher(null);
    setTpNote('');
    toast('Teacher feedback recorded.');
  };

  const sendInput = () => {
    const v = input.trim();
    if (!v) return toast('Type a message first.');
    exchange(v, { label: '💬 SCHOOL TEAM', text: 'Thanks for your message. It has been routed to the appropriate school team member.' });
    setInput('');
  };

  const renderBlock = (b: ChatBlock, key: number): ReactNode => {
    switch (b.t) {
      case 'subjects':
        return (
          <div className="subject-grid" key={key}>
            {b.items.map((s) => (
              <div className="subject" key={s.n}>
                <div className="topline">
                  <strong>{s.title}</strong>
                  <em>{s.n}</em>
                </div>
                <div className="q">{s.q}</div>
                <div className="q hi">{s.hi}</div>
              </div>
            ))}
          </div>
        );
      case 'understanding':
        return (
          <div key={key}>
            <p style={{ fontWeight: 800, color: '#075e54' }}>Quick check: how well did Rahul understand today? / जल्दी बताइए: राहुल ने आज कितना समझा?</p>
            <div className="feedback" role="group" aria-label="How well did Rahul understand today">
              {UNDERSTANDING.map((u, i) => (
                <button key={u.en} type="button" className={`fb${choice === i ? ' selected' : ''}`} aria-pressed={choice === i} onClick={() => chooseUnderstanding(i)}>
                  {u.en}
                  <br />
                  {u.hi}
                </button>
              ))}
            </div>
            <div className="note-box">
              <label className="prompt" htmlFor="wa-note">
                Anything specific? / कुछ खास बताना है?
              </label>
              <textarea id="wa-note" ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} onFocus={() => hold(15000)} placeholder="Teacher, subject, class or anything... / शिक्षक, विषय, कक्षा या कोई और बात..." />
              <div className="note-actions">
                <button type="button" className="send-note" onClick={sendNote}>
                  Send / भेजें
                </button>
                <button type="button" className="ghost" onClick={() => toast('Voice note recorder preview opened.')}>
                  🎤 Voice note
                </button>
              </div>
            </div>
          </div>
        );
      case 'homework':
        return (
          <div className="homework-card" key={key}>
            <div className="hw-head">
              <strong>{b.title}</strong>
              <span className="hw-rate">{b.rate}</span>
            </div>
            <div className="hw-track">
              <i style={{ width: `${b.done}%` }} />
            </div>
            <div className="hw-legend">
              <span>{b.legend[0]}</span>
              <span>{b.legend[1]}</span>
            </div>
            <div className="hw-list">
              {b.rows.map((r) => (
                <div className="hw-row" key={r.b}>
                  <div>
                    <b>{r.b}</b>
                    <span>{r.s}</span>
                  </div>
                  {role === 'parents' && <span className="pending">Pending</span>}
                </div>
              ))}
            </div>
          </div>
        );
      case 'actions':
        return (
          <div className={b.items.some((x) => x.kind) ? 'pay' : 'feedback'} key={key}>
            {b.items.map((a) => (
              <button key={a.id} type="button" className={a.kind === 'pay' ? 'pay-btn' : a.kind === 'ghost' ? 'ghost' : a.kind === 'open' ? 'open-btn' : a.kind === 'download' ? 'download' : 'fb'} onClick={() => onAction(a.id, a.label)}>
                {a.label}
                {a.hi && (
                  <>
                    <br />
                    {a.hi}
                  </>
                )}
              </button>
            ))}
          </div>
        );
      case 'teachers':
        return (
          <div key={key}>
            <div className="teacher-list">
              {TEACHERS.map((t, i) => (
                <button
                  key={t.name}
                  type="button"
                  className={`teacher${openTeacher === i ? ' open' : ''}`}
                  aria-expanded={openTeacher === i}
                  onClick={() => {
                    hold(15000);
                    setOpenTeacher(openTeacher === i ? null : i);
                    setStars(0);
                  }}
                >
                  <span className="avatar">{t.initials}</span>
                  <span>
                    <b>{t.name}</b>
                    <span>{`${t.subject} · ${t.note}`}</span>
                  </span>
                  <span className="teacher-arrow" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
            </div>
            {openTeacher !== null && (
              <div className="teacher-panel">
                <div className="tp-title">{`Rate ${TEACHERS[openTeacher].name} / ${TEACHERS[openTeacher].name} को रेट करें`}</div>
                <div className="tp-sub">{`${TEACHERS[openTeacher].subject} · subject teacher / विषय शिक्षक`}</div>
                <div className="stars" role="group" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} type="button" className={`star${s <= stars ? ' active' : ''}`} aria-label={`${s} star${s > 1 ? 's' : ''}`} onClick={() => setStars(s)}>
                      ★
                    </button>
                  ))}
                </div>
                <div className="tp-grid">
                  <select aria-label="What should we know?" value={focus} onChange={(e) => setFocus(e.target.value)}>
                    <option value="">What should we know? / क्या बताना चाहेंगे?</option>
                    {TEACHER_FOCUS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                  <select aria-label="Question type" value={qtype} onChange={(e) => setQtype(e.target.value)}>
                    <option value="">Question type / प्रश्न का प्रकार</option>
                    {TEACHER_QUESTION.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                  <textarea aria-label="Feedback or question" value={tpNote} onChange={(e) => setTpNote(e.target.value)} placeholder="Specific feedback or question... / अपनी खास प्रतिक्रिया या सवाल लिखें..." />
                  <button type="button" className="send-teacher-feedback" onClick={sendTeacherFeedback}>
                    Send to teacher / शिक्षक को भेजें
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      case 'system':
        return (
          <div className="note-system" key={key}>
            {b.text}
          </div>
        );
      case 'callout':
        return (
          <div className="callout" key={key}>
            {b.text}
          </div>
        );
      case 'photo':
        return <img key={key} className="celebrate-photo" src={b.src} alt={b.alt} loading="lazy" decoding="async" />;
      case 'certificate':
        return (
          <button key={key} type="button" onClick={() => setOverlay('cert')} style={{ border: 0, padding: 0, background: 'none', width: '100%' }} aria-label="View certificate">
            <img className="certificate-img" src={b.src} alt={b.alt} loading="lazy" decoding="async" />
          </button>
        );
      case 'growth':
        return (
          <div className="growth" key={key}>
            {b.rows.map((r) => (
              <div className="growth-row" key={r.label}>
                <b>{r.label}</b>
                <span className="growth-track" aria-label={`${r.label}: ${r.delta}`}>
                  <span className="was" style={{ width: `${r.was}%` }} />
                  <span className="now" style={{ width: `${r.now}%` }} />
                </span>
                <span className="delta">{r.delta}</span>
              </div>
            ))}
          </div>
        );
      case 'rank':
        return (
          <div key={key} aria-label={`Class position: #${b.me} of ${b.of}`}>
            {[b.names.slice(0, 5), b.names.slice(5, 10)].map((row, r) => (
              <div className="rank" key={r}>
                {row.map((n, i) => {
                  const pos = r * 5 + i + 1;
                  const me = pos === b.me;
                  return (
                    <div className={`rank-card${me ? ' me' : ''}`} key={n}>
                      <b>{pos}</b>
                      <span>{me ? `${n}★` : n}</span>
                      {me && <small>{`#${b.me} / ${b.of}`}</small>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      case 'kpis':
        return (
          <div className="kpis" key={key}>
            {b.items.map((k) => (
              <div className="kpi" key={k.label}>
                <b>{k.value}</b>
                <span>{k.label}</span>
              </div>
            ))}
          </div>
        );
      case 'rows':
        return (
          <div className="rows" key={key}>
            {b.items.map((r) => (
              <div className="row" key={r.left}>
                <span>{r.left}</span>
                <em className={`tone-${r.tone}`}>{r.right}</em>
              </div>
            ))}
          </div>
        );
    }
  };

  const renderMsg = (m: ChatMsg, key: string | number): ReactNode => {
    if (m.k === 'sep') {
      return (
        <div className="date-sep" key={key}>
          {m.text}
        </div>
      );
    }
    if (m.k === 'parent') {
      return (
        <div className="bubble bubble-parent" key={key}>
          <BiText bi={m.text} />
          <div className="msg-meta">
            {m.meta} <span className="ticks">✓✓</span>
          </div>
        </div>
      );
    }
    return (
      <div className="bubble ai" key={key}>
        <div className="ai-label">{m.label}</div>
        {m.title && (
          <h4>
            <Rich text={m.title.en} />
          </h4>
        )}
        {m.paras?.map((p, i) => <BiText key={i} bi={p} />)}
        {m.blocks?.map((b, i) => renderBlock(b, i))}
        <div className="msg-meta">{m.meta}</div>
      </div>
    );
  };

  const chat = role === 'parents' ? null : ROLE_CHATS[role];
  const messages = role === 'parents' ? PARENT_CHAT : chat!.messages;
  const pulseIndex = PARENT_CHAT.findIndex((m) => m.k === 'school' && m.blocks?.some((b) => b.t === 'understanding'));

  const onChatClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, label')) return;
    setPlaying((p) => !p);
    toast(playing ? 'Auto-scroll paused. Tap the chat to resume.' : 'Auto-scroll resumed.');
  };

  return (
    <div className={`flex w-full flex-col items-center gap-3 ${className}`}>
      <div
        className={`wa-float w-full ${held ? 'hold' : ''}`}
        onPointerEnter={() => {
          hover.current = true;
          setHeld(true);
        }}
        onPointerLeave={() => {
          hover.current = false;
          setHeld(false);
        }}
        onTouchStart={() => {
          hold();
          setHeld(true);
          setTimeout(() => setHeld(false), HOLD_AFTER_TOUCH);
        }}
      >
        <div className="wa-phone">
          <div className="iphone">
            <div className="frame-highlight" />
            <div className="island" />
            <div className="screen">
              <div className="ios-top">
                <span>9:41</span>
                <span aria-hidden="true">▮▮▮ ᯤ ▰</span>
              </div>
              <div className="wa-head">
                <span className="back" aria-hidden="true">
                  ‹
                </span>
                <div className="school-avatar" aria-hidden="true">
                  {chat ? chat.avatar : 'SI'}
                </div>
                <div>
                  <div className="wh-name">{chat ? chat.title : 'Sunrise International'}</div>
                  <div className="wh-sub">{chat ? chat.sub : 'School Connect · Rahul · Class 5'}</div>
                </div>
                <div className="wh-actions" aria-hidden="true">
                  <span>⌕</span>
                  <span>⋮</span>
                </div>
              </div>
              <div
                ref={chatRef}
                className="chat"
                role="region"
                aria-label={`Demo WhatsApp chat: ${chat ? chat.title : 'Sunrise International and Rahul’s parent'}`}
                tabIndex={0}
                onWheel={() => hold()}
                onKeyDown={() => hold(15000)}
                onClick={onChatClick}
              >
                {messages.map((m, i) => (
                  <Fragment key={i}>
                    {renderMsg(m, i)}
                    {role === 'parents' && i === pulseIndex && choice !== null && (
                      <>
                        <div className="bubble bubble-parent">
                          <p>{`Parent response: ${UNDERSTANDING[choice].en}`}</p>
                          <div className="msg-meta">
                            10:09 AM <span className="ticks">✓✓</span>
                          </div>
                        </div>
                        <div className="bubble ai">
                          <div className="ai-label">✓ RESPONSE RECORDED</div>
                          <p>{UNDERSTANDING[choice].reply}</p>
                          <div className="note-system">Response sent to class teacher + academic dashboard.</div>
                          <div className="msg-meta">10:09 AM</div>
                        </div>
                      </>
                    )}
                  </Fragment>
                ))}
                {appended.map((a) =>
                  'typing' in a ? (
                    <div className="typing" key={a.id} aria-label="School is typing">
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : (
                    renderMsg(a.msg, `x${a.id}`)
                  ),
                )}
              </div>

              {overlay === 'share' && (
                <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOverlay(null)}>
                  <div className="sheet" role="dialog" aria-label={shareTitle}>
                    <h4>{shareTitle}</h4>
                    <p>Choose where to share this achievement. Sharing is always the family’s choice.</p>
                    <div className="share-options">
                      {[
                        ['WhatsApp', 'WA', 'si-wa'],
                        ['Instagram', '◎', 'si-ig'],
                        ['Facebook', 'f', 'si-fb'],
                        ['More', '•••', 'si-more'],
                      ].map(([name, icon, cls]) => (
                        <button
                          key={name}
                          type="button"
                          className="share-opt"
                          onClick={() => {
                            setOverlay(null);
                            toast(name === 'More' ? 'More sharing options opened.' : `${name} share composer opened (demo).`);
                          }}
                        >
                          <span className={`si ${cls}`}>{icon}</span>
                          <b>{name}</b>
                        </button>
                      ))}
                    </div>
                    <button type="button" className="ghost wide-btn" onClick={() => setOverlay(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {overlay === 'cert' && (
                <div className="overlay center" onClick={(e) => e.target === e.currentTarget && setOverlay(null)}>
                  <div className="sheet" role="dialog" aria-label="Progress certificate">
                    <img className="certificate-img" src="/demo/rahul-certificate.webp" alt="Full Progress Certificate for Rahul Sharma (demo school)" />
                    <div className="cert-actions">
                      <button type="button" className="cert-close" onClick={() => setOverlay(null)}>
                        Close
                      </button>
                      <button
                        type="button"
                        className="cert-save"
                        onClick={() => {
                          download('/demo/rahul-certificate.webp', 'Demo_Rahul_Sharma_Progress_Certificate.webp');
                          toast('Demo certificate downloaded.');
                        }}
                      >
                        ⬇ Download
                      </button>
                      <button
                        type="button"
                        className="cert-close"
                        onClick={() => {
                          setShareTitle('Share Rahul’s progress certificate');
                          setOverlay('share');
                        }}
                      >
                        ↗ Share
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {overlay === 'menu' && (
                <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOverlay(null)}>
                  <div className="sheet" role="dialog" aria-label="School menu">
                    <h4>Sunrise International · Menu</h4>
                    <p>Everything about Rahul, answered in this chat.</p>
                    <div className="menu-list">
                      {PARENT_MENU.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="menu-item"
                          onClick={() => {
                            setOverlay(null);
                            exchange(m.label, { label: `${m.icon} ${m.label.toUpperCase()}`, text: m.reply });
                          }}
                        >
                          <i aria-hidden="true">{m.icon}</i>
                          <span>
                            <b>{m.label}</b>
                            <span>{m.hint}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className={`toast${toastMsg ? ' show' : ''}`} aria-live="polite">
                {toastMsg}
              </div>

              <form
                className="phone-footer"
                onSubmit={(e) => {
                  e.preventDefault();
                  hold(9000);
                  if (role === 'parents') sendInput();
                  else toast('Demo chat: nothing is sent.');
                }}
              >
                {role === 'parents' ? (
                  <button type="button" className="menu-btn" onClick={() => setOverlay('menu')}>
                    ☰ Menu
                  </button>
                ) : (
                  <button type="button" className="emoji" aria-label="Emoji" onClick={() => toast('Emoji picker (demo).')}>
                    😊
                  </button>
                )}
                <input className="msg-input" aria-label="Message" value={input} onChange={(e) => setInput(e.target.value)} onFocus={() => hold(15000)} placeholder="Message / संदेश" />
                <button type="submit" className="mic" aria-label="Send">
                  ➤
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-nowrap items-center justify-center gap-1.5 text-xs font-bold text-slate">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={!playing}
          aria-label={playing ? 'Pause auto-scroll' : 'Play auto-scroll'}
          className="nca-lift inline-flex min-h-[36px] items-center gap-1 rounded-full border border-slate/15 bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button type="button" onClick={scrollBottom} aria-label="Jump to latest message" className="nca-lift inline-flex min-h-[36px] items-center rounded-full border border-slate/15 bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
          ↓ Latest
        </button>
        <button
          type="button"
          onClick={() => {
            setAppended([]);
            setChoice(null);
            setPlaying(true);
            holdUntil.current = 0;
            chatRef.current?.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
          }}
          className="nca-lift inline-flex min-h-[36px] items-center rounded-full border border-slate/15 bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
        >
          ↺ Restart
        </button>
      </div>
    </div>
  );
}

