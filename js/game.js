/* Bari's Soccer RNG */
(() => {
  'use strict';

  // ====== CẤU HÌNH ======
  // Mỗi sơ đồ: các hàng từ trên (tấn công) xuống dưới (thủ môn)
  const FORMATIONS = {
    '4-3-3':   [['LW', 'ST', 'RW'], ['CM', 'CM', 'CM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
    '4-4-2':   [['ST', 'ST'], ['LM', 'CM', 'CM', 'RM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
    '4-5-1':   [['ST'], ['LM', 'CM', 'CDM', 'CM', 'RM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
    '4-3-2-1': [['ST'], ['CAM', 'CAM'], ['CM', 'CDM', 'CM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
    '5-4-1':   [['ST'], ['LM', 'CM', 'CM', 'RM'], ['LWB', 'CB', 'CB', 'CB', 'RWB'], ['GK']],
    '3-5-2':   [['ST', 'ST'], ['LM', 'CM', 'CDM', 'CM', 'RM'], ['CB', 'CB', 'CB'], ['GK']],
    '2-3-5':   [['LW', 'ST', 'ST', 'ST', 'RW'], ['CM', 'CM', 'CM'], ['CB', 'CB'], ['GK']],
  };
  const MAX_REROLL = 3;
  const TIER_WEIGHTS = [30, 40, 20, 10]; // <=79, 80-99, 100-109, 110+

  // Nhóm vị trí: cùng nhóm nhưng khác vị trí => trắng (-3). Khác nhóm => đỏ (/2)
  const GROUP = {
    GK: 'GK',
    RWB: 'DEF', RB: 'DEF', CB: 'DEF', LB: 'DEF', LWB: 'DEF',
    RM: 'MID', CM: 'MID', CDM: 'MID', CAM: 'MID', LM: 'MID',
    RW: 'ATT', RF: 'ATT', CF: 'ATT', ST: 'ATT', LF: 'ATT', LW: 'ATT',
  };

  const CARDS = window.CARDS;
  const BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));
  const tierOf = ovr => (ovr <= 79 ? 0 : ovr <= 99 ? 1 : ovr <= 109 ? 2 : 3);
  const POOLS = [[], [], [], []];
  CARDS.forEach(c => POOLS[tierOf(c.ovr)].push(c));

  // preload ảnh để hiệu ứng quay mượt
  CARDS.forEach(c => { const i = new Image(); i.src = c.img; });

  // ====== LƯU TRỮ ======
  const KEY = 'bsr_save_v1';
  let save = (() => {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.lineups) return s; } catch (e) {}
    return { formation: '4-3-3', lineups: {} };
  })();
  const persist = () => localStorage.setItem(KEY, JSON.stringify(save));
  const slotCount = f => FORMATIONS[f].reduce((n, r) => n + r.length, 0);
  const flatPos = f => FORMATIONS[f].flat();
  const lineupOf = f => save.lineups[f] || (save.lineups[f] = Array(slotCount(f)).fill(null));
  const totalOf = lu => lu.reduce((s, p) => s + (p ? p.ovr : 0), 0);
  // OVR đội = tổng / 11 (số cầu thủ), làm tròn lên (65.5 -> 66)
  const avgOf = lu => Math.ceil(totalOf(lu) / lu.length);

  // ====== LOGIC OVR ======
  function evalOvr(card, slotPos) {
    if (card.pos === slotPos) return { ovr: card.ovr, kind: 'exact' };
    if (GROUP[card.pos] === GROUP[slotPos]) return { ovr: Math.max(0, card.ovr - 3), kind: 'near' };
    return { ovr: Math.round(card.ovr / 2), kind: 'bad' };
  }

  function pickCard() {
    let r = Math.random() * 100, tier = 0;
    for (let i = 0; i < TIER_WEIGHTS.length; i++) { if (r < TIER_WEIGHTS[i]) { tier = i; break; } r -= TIER_WEIGHTS[i]; }
    const pool = POOLS[tier].length ? POOLS[tier] : CARDS;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function pickThree() {
    const out = [];
    while (out.length < 3) { const c = pickCard(); if (!out.includes(c)) out.push(c); }
    return out;
  }

  // ====== DOM ======
  const $ = id => document.getElementById(id);
  const mainEl = $('main'), builderEl = $('builder');
  const mainPitch = $('mainPitch'), builderPitch = $('builderPitch');
  const rollBtn = $('rollBtn'), rerollText = $('rerollText'), rollCardsEl = $('rollCards');
  const rollPanel = $('rollPanel'), resultPanel = $('resultPanel');
  const rollSlots = [...rollCardsEl.querySelectorAll('.roll-slot')];

  function glowClass(ovr) { const t = tierOf(ovr); return t === 3 ? 'glow-red' : t === 2 ? 'glow-gold' : ''; }

  function makeCardImg(card, extra = '') {
    const img = document.createElement('img');
    img.className = ('card ' + extra).trim();
    img.src = card.img; img.draggable = false; img.alt = card.pos;
    return img;
  }

  // Vẽ sân + các ô. data: mảng {id, ovr, kind} | null. labels: hiện nhãn vị trí ở ô trống
  function renderPitch(el, formation, data, { labels, popIdx = -1, movableIdx = -1 } = {}) {
    el.querySelectorAll('.slot, .circle, .box').forEach(n => n.remove());
    ['circle', 'box top', 'box bot'].forEach(c => { const d = document.createElement('div'); d.className = c; el.appendChild(d); });
    const rows = FORMATIONS[formation];
    const W = el.clientWidth, H = el.clientHeight;
    const n = rows.length;
    const rowH = H * 0.76 / (n - 1);
    const cw = Math.max(30, Math.min(W * 0.15, rowH * 0.8 * 0.8));
    el.style.setProperty('--cw', cw + 'px');
    let idx = 0;
    rows.forEach((row, ri) => {
      const y = 12 + ri * (76 / (n - 1));
      row.forEach((pos, ci) => {
        const x = (ci + 1) / (row.length + 1) * 100;
        const s = document.createElement('div');
        s.className = 'slot'; s.dataset.idx = idx; s.dataset.pos = pos;
        s.style.left = x + '%'; s.style.top = y + '%';
        const p = data[idx];
        if (p) {
          const card = BY_ID[p.id];
          s.classList.add('filled'); if (idx === popIdx) s.classList.add('pop'); if (idx === movableIdx) s.classList.add('movable');
          s.appendChild(makeCardImg(card, glowClass(card.ovr)));
          const pill = document.createElement('div');
          pill.className = 'ovr-pill ' + p.kind; pill.textContent = p.ovr;
          s.appendChild(pill);
        } else {
          s.classList.add('empty');
          if (labels) { const l = document.createElement('span'); l.className = 'poslabel'; l.textContent = pos; s.appendChild(l); }
        }
        el.appendChild(s);
        idx++;
      });
    });
  }

  // ====== MÀN HÌNH CHÍNH ======
  function renderMain() {
    const f = save.formation;
    const lu = lineupOf(f);
    $('formationBtn').firstChild.textContent = f + ' ';
    $('mainOvr').textContent = avgOf(lu);
    renderPitch(mainPitch, f, lu, { labels: false });
  }

  function openFormationSheet() {
    const list = $('formationList'); list.innerHTML = '';
    Object.keys(FORMATIONS).forEach(f => {
      const b = document.createElement('button');
      b.className = 'sheet-item' + (f === save.formation ? ' active' : '');
      const t = avgOf(lineupOf(f)); const hasData = totalOf(lineupOf(f)) > 0;
      b.innerHTML = `<span>${f}</span><small>${hasData ? 'OVR ' + t : ''}</small>`;
      b.onclick = () => { Sound.click(); save.formation = f; persist(); $('formationSheet').classList.add('hidden'); renderMain(); };
      list.appendChild(b);
    });
    $('formationSheet').classList.remove('hidden');
  }

  // ====== LẬP ĐỘI ======
  let run = null;
  let runToken = 0;

  function openBuilder() {
    const f = save.formation;
    run = { formation: f, slots: Array(slotCount(f)).fill(null), rerolls: MAX_REROLL, filled: 0, rolled: null, chosen: -1, phase: 'idle', last: -1, moving: false };
    runToken++;
    $('builderTitle').textContent = f;
    resultPanel.classList.add('hidden'); rollPanel.classList.remove('hidden');
    builderEl.classList.remove('hidden');
    resetRollSlots();
    updateProgress(); updateRollUI();
    requestAnimationFrame(() => renderBuilder());
  }

  function renderBuilder(popIdx = -1) {
    renderPitch(builderPitch, run.formation, run.slots, { labels: true, popIdx, movableIdx: run.phase === 'idle' ? run.last : -1 });
    if (run.phase === 'place' || run.moving) markHints();
  }
  function markHints() { builderPitch.querySelectorAll('.slot.empty').forEach(s => s.classList.add('hint')); }
  function updateProgress() { $('builderProgress').textContent = run.filled + '/' + run.slots.length; }

  function resetRollSlots() {
    rollSlots.forEach(s => { s.className = 'roll-slot'; s.innerHTML = ''; });
  }

  function updateRollUI() {
    rollBtn.classList.remove('alt');
    rerollText.textContent = `Bạn còn ${run.rerolls} lượt roll lại`;
    switch (run.phase) {
      case 'idle': rollBtn.textContent = 'ROLL'; rollBtn.disabled = false; break;
      case 'spinning': rollBtn.textContent = 'ĐANG QUAY...'; rollBtn.disabled = true; break;
      case 'choose':
        if (run.rerolls > 0) { rollBtn.textContent = 'ROLL LẠI'; rollBtn.disabled = false; rollBtn.classList.add('alt'); }
        else { rollBtn.textContent = 'CHỌN 1 THẺ'; rollBtn.disabled = true; rerollText.textContent = 'Đã hết lượt roll lại, hãy chọn 1 trong 3 thẻ'; }
        break;
      case 'place': rollBtn.textContent = 'KÉO THẺ VÀO SÂN'; rollBtn.disabled = true; break;
    }
  }

  function startRoll() {
    const token = runToken;
    run.phase = 'spinning'; run.chosen = -1; run.last = -1; run.moving = false;
    renderBuilder(); // khóa các thẻ đã đặt
    run.rolled = pickThree();
    resetRollSlots();
    updateRollUI();
    Sound.whoosh();
    let finished = 0;
    rollSlots.forEach((slot, i) => {
      slot.classList.add('has-card', 'spinning');
      const img = document.createElement('img'); slot.appendChild(img);
      const total = 14 + i * 3;
      let k = 0;
      const step = () => {
        if (token !== runToken || !run) return;
        if (k >= total) {
          const card = run.rolled[i];
          img.src = card.img;
          img.className = glowClass(card.ovr);
          slot.classList.remove('spinning'); slot.classList.add('landed');
          Sound.land(tierOf(card.ovr));
          if (++finished === 3) { run.phase = 'choose'; updateRollUI(); }
          return;
        }
        img.src = CARDS[Math.floor(Math.random() * CARDS.length)].img;
        Sound.tick(k / total);
        k++;
        setTimeout(step, 45 * Math.pow(1.1, k));
      };
      step();
    });
  }

  rollBtn.addEventListener('click', () => {
    if (!run) return;
    if (run.phase === 'idle') startRoll();
    else if (run.phase === 'choose' && run.rerolls > 0) { run.rerolls--; startRoll(); }
    else Sound.deny();
  });

  // chọn 1 trong 3 thẻ
  rollSlots.forEach((slot, i) => {
    slot.addEventListener('click', () => {
      if (!run || run.phase !== 'choose') return;
      run.chosen = i; run.phase = 'place';
      rollSlots.forEach((s, j) => { if (j === i) s.classList.add('chosen'); else s.classList.add('dimmed'); });
      Sound.select();
      updateRollUI(); markHints();
    });

    // kéo thẻ đã chọn
    slot.addEventListener('pointerdown', e => {
      if (!run || run.phase !== 'place' || run.chosen !== i) return;
      startDrag(e, slot, placeCard);
    });
  });

  // kéo thả dùng chung: thẻ mới chọn -> sân, hoặc thẻ vừa đặt -> ô trống khác
  function startDrag(e, srcEl, onDrop) {
    e.preventDefault();
    const rect = srcEl.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.width = rect.width + 'px'; ghost.style.height = rect.height + 'px';
    ghost.appendChild(srcEl.querySelector('img').cloneNode());
    let started = false, overSlot = null;
    const sx = e.clientX, sy = e.clientY;

    const move = ev => {
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) { started = true; document.body.appendChild(ghost); srcEl.style.opacity = .35; }
      if (!started) return;
      ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
      const t = document.elementFromPoint(ev.clientX, ev.clientY);
      const s = t && t.closest('#builderPitch .slot.empty');
      if (s !== overSlot) { if (overSlot) overSlot.classList.remove('over'); overSlot = s; if (s) s.classList.add('over'); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      ghost.remove(); srcEl.style.opacity = '';
      if (overSlot) { overSlot.classList.remove('over'); onDrop(+overSlot.dataset.idx); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  // thẻ vừa đặt vẫn kéo được cho tới khi bấm ROLL tiếp theo
  builderPitch.addEventListener('pointerdown', e => {
    const s = e.target.closest('.slot.movable');
    if (s && run && run.phase === 'idle' && run.last >= 0) startDrag(e, s, moveLast);
  });

  // chạm vào ô trống khi đã chọn thẻ (cách đặt thẻ thay thế cho kéo)
  builderPitch.addEventListener('click', e => {
    if (!run) return;
    const m = e.target.closest('.slot.movable');
    if (m && run.phase === 'idle') { run.moving = !run.moving; Sound.select(); renderBuilder(); return; }
    const s = e.target.closest('.slot.empty');
    if (!s) return;
    if (run.phase === 'place') placeCard(+s.dataset.idx);
    else if (run.phase === 'idle' && run.moving && run.last >= 0) moveLast(+s.dataset.idx);
  });

  function placeCard(idx) {
    if (!run || run.phase !== 'place' || run.slots[idx]) return;
    const card = run.rolled[run.chosen];
    const ev = evalOvr(card, flatPos(run.formation)[idx]);
    run.slots[idx] = { id: card.id, ovr: ev.ovr, kind: ev.kind };
    run.filled++; run.phase = 'idle'; run.rolled = null; run.chosen = -1; run.last = idx; run.moving = false;
    Sound.place(ev.kind);
    resetRollSlots();
    renderBuilder(idx);
    updateProgress();
    if (run.filled === run.slots.length) finishRun(); else updateRollUI();
  }

  // đổi chỗ thẻ vừa đặt (chỉ được tới khi bấm ROLL tiếp)
  function moveLast(to) {
    if (!run || run.phase !== 'idle' || run.last < 0 || run.slots[to]) return;
    const p = run.slots[run.last];
    const card = BY_ID[p.id];
    const ev = evalOvr(card, flatPos(run.formation)[to]);
    run.slots[run.last] = null;
    run.slots[to] = { id: card.id, ovr: ev.ovr, kind: ev.kind };
    run.last = to; run.moving = false;
    Sound.place(ev.kind);
    renderBuilder(to);
  }

  function finishRun() {
    const f = run.formation;
    const main = lineupOf(f);
    const prevTotal = totalOf(main);
    const isRecord = totalOf(run.slots) > prevTotal; // so sánh tổng điểm cho chính xác
    const prev = avgOf(main);
    const total = avgOf(run.slots);
    // đội hình mạnh nhất: vị trí nào cầu thủ mới xịn hơn thì thay
    run.slots.forEach((p, i) => { if (!main[i] || p.ovr > main[i].ovr) main[i] = p; });
    persist();

    run.phase = 'done';
    rollPanel.classList.add('hidden'); resultPanel.classList.remove('hidden');
    const title = $('resultTitle');
    title.textContent = isRecord ? '🏆 KỈ LỤC MỚI!' : 'HOÀN THÀNH ĐỘI HÌNH';
    title.classList.toggle('record', isRecord);
    $('resultOvr').textContent = 'OVR ' + total;
    $('resultSub').textContent = isRecord
      ? (prevTotal > 0 ? `Kỉ lục cũ: ${prev}` : 'Đội hình đầu tiên của bạn!')
      : `Kỉ lục hiện tại của sơ đồ ${f}: ${prev}`;
    isRecord ? Sound.record() : Sound.done();
    run.phase = 'done'; run.last = -1;
    // renderBuilder lại để layout chính xác sau khi panel thay đổi chiều cao
    requestAnimationFrame(() => renderBuilder());
  }

  function closeBuilder() {
    runToken++; run = null;
    builderEl.classList.add('hidden');
    renderMain();
  }

  // ====== SỰ KIỆN CHUNG ======
  $('buildBtn').addEventListener('click', () => { Sound.click(); openBuilder(); });
  $('formationBtn').addEventListener('click', () => { Sound.click(); openFormationSheet(); });
  $('formationSheet').addEventListener('click', e => { if (e.target.id === 'formationSheet') $('formationSheet').classList.add('hidden'); });
  $('closeBuilder').addEventListener('click', () => {
    if (run && run.phase !== 'done' && run.filled > 0 && !confirm('Thoát bây giờ sẽ mất lượt lập đội này. Thoát?')) return;
    Sound.click(); closeBuilder();
  });
  $('resultClose').addEventListener('click', () => { Sound.click(); closeBuilder(); });

  const soundBtn = $('soundBtn');
  const refreshSoundBtn = () => { soundBtn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
  soundBtn.addEventListener('click', () => { Sound.toggle(); refreshSoundBtn(); });
  refreshSoundBtn();
  window.addEventListener('pointerdown', () => Sound.unlock(), { once: true });

  window.addEventListener('resize', () => {
    if (run) renderBuilder(); else renderMain();
  });

  renderMain();
})();
