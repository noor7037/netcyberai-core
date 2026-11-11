// Template: <Name in plain words>. <One paragraph: what the child does, what they see, what real rule the template
// computes, and what is simplified.> Config:
//   { <key>: <type> (<limits>), … }
// Copy to labs/templates/<id>.js (a NEW file), replace every <…>, keep the shape. Contract: labs/CONTRACT.md §2.
(function () {
  const { esc } = window.NCA_LIB;
  const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
  const isBi = (x) => x && typeof x === 'object' && typeof x.en === 'string' && typeof x.hi === 'string' && x.en.trim() && x.hi.trim();

  // 1. validate(config) → [] when the config is usable, else a list of plain-English problems. Reject unknown keys,
  //    impossible cases and anything the model cannot show honestly.
  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    Object.keys(c).forEach((k) => { if (!['<key>'].includes(k)) e.push('unknown key: ' + k); });
    // …
    return e;
  }

  // 2. keys(config) → every control a guided step may target (data-key values; "*" patterns allowed) and every event
  //    mount() emits. The labs checker refuses steps that use anything not listed here.
  function keys(c) {
    return { targets: ['<control>', '<control>:*', 'reset'], events: ['<event>', '<event>:*'] };
  }

  // 3. css — every class prefixed with the template id; Family colours through the page's CSS variables; 44 px targets;
  //    no motion under reduced motion; nothing wider than 360 px without wrapping.
  const css = `
.<id>-wrap { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
.<id>-row button { min-height: 44px; border-radius: 999px; border: 1.5px solid var(--line, #E7E1D6); background: var(--surface, #FFFDF9); padding: 0 14px; font-weight: 700; cursor: pointer; color: var(--ink, #1C1B1A); }
.<id>-row button[aria-pressed="true"] { background: var(--action, #E8702A); border-color: var(--action, #E8702A); }
.<id>-note { font-weight: 600; padding: 10px 12px; border-radius: 12px; background: var(--sunk, #F4EFE7); }
@media (prefers-reduced-motion: reduce) { .<id>-wrap * { animation: none !important; transition: none !important; } }
`;

  // 4. mount(root, config, api) → draws the lab and returns { destroy }. Every visible word through api.t({en, hi});
  //    every control has data-key; check api.allowed(key) before acting (api.nudge() if not); api.emit(event) for each
  //    event in keys(); api.record(line) for the tutor; api.celebrate() on success. Compute the real rule.
  function mount(root, config, api) {
    const t = (en, hi) => api.t({ en, hi });
    let destroyed = false;
    const state = { /* … */ };
    function render() {
      root.innerHTML = `<div class="<id>-wrap">
        <svg viewBox="0 0 360 200" role="img" aria-label="${esc(t('<what the picture shows>', '<हिंदी में>'))}"><!-- the scene --></svg>
        <div class="<id>-row" role="group"><button type="button" data-key="<control>">${esc(t('<Label>', '<लेबल>'))}</button><button type="button" data-key="reset">${esc(t('Start again', 'फिर से शुरू करो'))}</button></div>
        <p class="<id>-note" aria-live="polite">${esc(t('<what is happening and why>', '<क्या हो रहा है और क्यों>'))}</p>
      </div>`;
    }
    function onClick(ev) {
      const b = ev.target.closest('[data-key]');
      if (!b || destroyed) return;
      const k = b.getAttribute('data-key');
      if (!api.allowed(k)) { api.nudge(); return; }
      // … change state by the real rule, then:
      api.emit('<event>');
      render();
    }
    root.addEventListener('click', onClick);
    render();
    return { destroy() { destroyed = true; root.removeEventListener('click', onClick); root.innerHTML = ''; } };
  }

  // 5. demo — a config that shows the template at its best (the smoke test mounts it).
  NCA_T.register({ id: '<id>', css, validate, keys, demo: { /* … */ }, mount });
})();
