const $ = (id) => document.getElementById(id);

const GUEST_CACHE = 'conexion_guests_cache';
const VIP_CACHE = 'conexion_vip_cache';
const BLACK_CACHE = 'conexion_blacklist_cache';
const HISTORY_CACHE = 'conexion_history_cache';

let guests = loadCache(GUEST_CACHE);
let vipGuests = loadCache(VIP_CACHE);
let blacklist = loadCache(BLACK_CACHE);
let history = loadCache(HISTORY_CACHE);
let openHistory = new Set();
let pin = localStorage.getItem('gjbross_pin') || '';

$('pinInput').value = pin;
$('closeDateInput').value = today();
$('vipCloseDateInput').value = today();

if (pin) $('pinCard').classList.add('hidden');
else $('pinCard').classList.remove('hidden');

$('savePinBtn').onclick = () => {
  pin = $('pinInput').value.trim();
  localStorage.setItem('gjbross_pin', pin);
  $('pinCard').classList.add('hidden');
  load();
};

$('btnGuestsTab').onclick = () => showTab('guests');
$('btnVipTab').onclick = () => showTab('vip');
$('btnBlacklistTab').onclick = () => showTab('blacklist');
$('btnHistoryTab').onclick = () => showTab('history');
$('closeListBtn').onclick = closeList;
$('closeVipListBtn').onclick = closeVipList;
$('clearHistoryBtn').onclick = clearHistory;

$('refreshBtn').onclick = async () => {
  const btn = $('refreshBtn');
  const oldText = btn.textContent;

  btn.disabled = true;
  btn.textContent = 'Actualizando...';

  await load();

  btn.textContent = 'Actualizado ✓';

  setTimeout(() => {
    btn.textContent = oldText;
    btn.disabled = false;
  }, 1200);
};

function showTab(tab) {
  const vip = tab === 'vip';
  const black = tab === 'blacklist';
  const hist = tab === 'history';

  $('guestPanel').classList.toggle('hidden', vip || black || hist);
  $('vipPanel').classList.toggle('hidden', !vip);
  $('blacklistPanel').classList.toggle('hidden', !black);
  $('historyPanel').classList.toggle('hidden', !hist);

  $('btnGuestsTab').classList.toggle('active', tab === 'guests');
  $('btnVipTab').classList.toggle('active', vip);
  $('btnBlacklistTab').classList.toggle('active', black);
  $('btnHistoryTab').classList.toggle('active', hist);

  if ((vip || black || hist) && !pin) $('pinCard').classList.remove('hidden');
}

function loadCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function saveCache() {
  localStorage.setItem(GUEST_CACHE, JSON.stringify(guests));
  localStorage.setItem(VIP_CACHE, JSON.stringify(vipGuests));
  localStorage.setItem(BLACK_CACHE, JSON.stringify(blacklist));
  localStorage.setItem(HISTORY_CACHE, JSON.stringify(history));
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': pin,
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
}

async function load() {
  try {
    const data = await api('/api/guests?t=' + Date.now());
    guests = (data.guests || []).map(normalizeGuest);
  } catch {
    if (!guests.length) $('list').innerHTML = `<div class="empty">No se pudo cargar la lista.</div>`;
  }

  if (pin) {
    try {
      const dataVip = await api('/api/vip-guests?t=' + Date.now());
      vipGuests = (dataVip.vipGuests || []).map(normalizeGuest);
    } catch {
      if (!vipGuests.length) $('vipList').innerHTML = `<div class="empty">No se pudo cargar VIP.</div>`;
    }

    try {
      const dataBlack = await api('/api/blacklist?t=' + Date.now());
      blacklist = dataBlack.blacklist || [];
    } catch {}

    try {
      const dataHistory = await api('/api/history?t=' + Date.now());
      history = dataHistory.history || [];
    } catch {}
  }

  saveCache();
  renderGuests();
  renderVip();
  renderBlacklist();
  renderHistory();
}

function normalizeGuest(g) {
  const qty = Math.max(1, Number(g.qty || 1));
  let entered = Number(g.entered ?? 0);

  if (g.attended && !g.entered) entered = qty;
  entered = Math.max(0, Math.min(qty, entered));

  return { ...g, qty, entered, attended: entered >= qty };
}

function isBlacklisted(name) {
  const clean = normalizeText(name);
  return blacklist.some(b => normalizeText(b.name) === clean);
}

function normalizeText(text) {
  return String(text || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

$('guestForm').onsubmit = async (e) => {
  e.preventDefault();

  const name = $('nameInput').value.trim();
  const qty = Math.max(1, Number($('qtyInput').value || 1));

  if (!pin) return alert('Primero coloca el PIN');
  if (!name) return;

  if (isBlacklisted(name)) {
    const ok = confirm('ATENCIÓN: esta persona está en LISTA NEGRA. ¿Igual quieres agregarla?');
    if (!ok) return;
  }

  try {
    const data = await api('/api/guests', {
      method: 'POST',
      body: JSON.stringify({ name, qty, entered: 0, attended: false })
    });

    guests = (data.guests || []).map(normalizeGuest);
    saveCache();

    $('nameInput').value = '';
    $('qtyInput').value = 1;

    renderGuests();
  } catch (e) {
    alert(e.message);
  }
};

$('vipForm').onsubmit = async (e) => {
  e.preventDefault();

  const name = $('vipNameInput').value.trim();
  const qty = Math.max(1, Number($('vipQtyInput').value || 1));

  if (!pin) return alert('Primero coloca el PIN');
  if (!name) return;

  if (isBlacklisted(name)) {
    const ok = confirm('ATENCIÓN: esta persona está en LISTA NEGRA. ¿Igual quieres agregarla como VIP?');
    if (!ok) return;
  }

  try {
    const data = await api('/api/vip-guests', {
      method: 'POST',
      body: JSON.stringify({ name, qty, entered: 0, attended: false })
    });

    vipGuests = (data.vipGuests || []).map(normalizeGuest);
    saveCache();

    $('vipNameInput').value = '';
    $('vipQtyInput').value = 1;

    renderVip();
  } catch (e) {
    alert(e.message);
  }
};

async function closeList() {
  if (!pin) return alert('Primero coloca el PIN');
  if (!guests.length) return alert('La lista de invitados está vacía');

  const date = $('closeDateInput').value || today();

  const ok = confirm('Cerrar la lista de invitados de ' + formatDate(date) + '? Se guardará en historial y se vaciará solo Invitados.');
  if (!ok) return;

  try {
    const data = await api('/api/close-list', {
      method: 'POST',
      body: JSON.stringify({ date })
    });

    guests = (data.guests || []).map(normalizeGuest);
    history = data.history || [];

    saveCache();
    renderGuests();
    renderHistory();
    alert('Lista de invitados cerrada y guardada en historial.');
  } catch (e) {
    alert(e.message);
  }
}

async function closeVipList() {
  if (!pin) return alert('Primero coloca el PIN');
  if (!vipGuests.length) return alert('La lista VIP está vacía');

  const date = $('vipCloseDateInput').value || today();

  const ok = confirm('Cerrar la lista VIP de ' + formatDate(date) + '? Se agregará al historial de esa fecha con etiqueta VIP.');
  if (!ok) return;

  try {
    const data = await api('/api/close-vip-list', {
      method: 'POST',
      body: JSON.stringify({ date })
    });

    guests = (data.guests || []).map(normalizeGuest);
    vipGuests = (data.vipGuests || []).map(normalizeGuest);
    history = data.history || [];

    saveCache();
    renderGuests();
    renderVip();
    renderHistory();

    alert('Lista VIP cerrada y agregada al historial.');
  } catch (e) {
    alert(e.message);
  }
}

async function clearHistory() {
  if (!pin) return alert('Primero coloca el PIN');
  if (!history.length) return alert('No hay historial para borrar');

  const ok = confirm('¿Seguro quieres borrar TODO el historial? Esta acción no se puede deshacer.');
  if (!ok) return;

  try {
    const data = await api('/api/history', { method: 'DELETE' });
    history = data.history || [];
    saveCache();
    renderHistory();
    alert('Historial borrado.');
  } catch (e) {
    alert(e.message);
  }
}

$('blackForm').onsubmit = async (e) => {
  e.preventDefault();

  const name = $('blackNameInput').value.trim();
  const note = $('blackNoteInput').value.trim();

  if (!pin) return alert('Primero coloca el PIN');
  if (!name) return;

  try {
    const data = await api('/api/blacklist', {
      method: 'POST',
      body: JSON.stringify({ name, note })
    });

    blacklist = data.blacklist || [];
    saveCache();

    $('blackNameInput').value = '';
    $('blackNoteInput').value = '';

    renderBlacklist();
  } catch (e) {
    alert(e.message);
  }
};

$('searchInput').oninput = renderGuests;
$('vipSearchInput').oninput = renderVip;
$('blackSearchInput').oninput = renderBlacklist;
$('historySearchInput').oninput = renderHistory;

async function setEntered(id, value) {
  const guest = guests.find(g => g.id === id);
  if (!guest) return;

  const qty = Math.max(1, Number(guest.qty || 1));
  const entered = Math.max(0, Math.min(qty, Number(value || 0)));

  const data = await api(`/api/guests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ entered, attended: entered >= qty })
  });

  guests = (data.guests || []).map(normalizeGuest);
  saveCache();
  renderGuests();
}

async function setVipEntered(id, value) {
  const guest = vipGuests.find(g => g.id === id);
  if (!guest) return;

  const qty = Math.max(1, Number(guest.qty || 1));
  const entered = Math.max(0, Math.min(qty, Number(value || 0)));

  const data = await api(`/api/vip-guests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ entered, attended: entered >= qty })
  });

  vipGuests = (data.vipGuests || []).map(normalizeGuest);
  saveCache();
  renderVip();
}

async function toggle(id) {
  const guest = guests.find(g => g.id === id);
  if (!guest) return;

  const qty = Math.max(1, Number(guest.qty || 1));
  const entered = Number(guest.entered || 0) >= qty ? 0 : qty;

  await setEntered(id, entered);
}

async function toggleVip(id) {
  const guest = vipGuests.find(g => g.id === id);
  if (!guest) return;

  const qty = Math.max(1, Number(guest.qty || 1));
  const entered = Number(guest.entered || 0) >= qty ? 0 : qty;

  await setVipEntered(id, entered);
}

async function removeGuest(id) {
  if (!confirm('Borrar invitado?')) return;

  const data = await api(`/api/guests/${id}`, { method: 'DELETE' });
  guests = (data.guests || []).map(normalizeGuest);

  saveCache();
  renderGuests();
}

async function removeVip(id) {
  if (!confirm('Borrar invitado VIP?')) return;

  const data = await api(`/api/vip-guests/${id}`, { method: 'DELETE' });
  vipGuests = (data.vipGuests || []).map(normalizeGuest);

  saveCache();
  renderVip();
}

async function removeBlack(id) {
  if (!confirm('Borrar de lista negra?')) return;

  const data = await api(`/api/blacklist/${id}`, { method: 'DELETE' });
  blacklist = data.blacklist || [];

  saveCache();
  renderBlacklist();
}

function renderList(items, opts) {
  const q = $(opts.searchId).value.trim().toLowerCase();
  const filtered = items.filter(g => g.name.toLowerCase().includes(q));

  $(opts.listId).innerHTML = filtered.length ? filtered.map(g => {
    const qty = Number(g.qty || 1);
    const entered = Number(g.entered || 0);
    const pending = qty - entered;
    const done = entered >= qty;
    const black = isBlacklisted(g.name);

    return `
      <div class="row ${done ? 'done' : ''} ${black ? 'black-alert' : ''} ${opts.vip ? 'vip-row' : ''}">
        <button class="check" onclick="${opts.toggleFn}('${g.id}')">${done ? '✓' : '○'}</button>
        <div class="info">
          <div class="name">${escapeHtml(g.name)} ${black ? '<span class="badge-danger">LISTA NEGRA</span>' : ''}</div>
          <div class="sub">Total ${qty} · Ingresaron ${entered} · Pendientes ${pending}</div>
          <div class="entry-controls">
            <button onclick="${opts.setFn}('${g.id}', ${entered - 1})">-</button>
            <span>${entered}/${qty}</span>
            <button onclick="${opts.setFn}('${g.id}', ${entered + 1})">+</button>
          </div>
        </div>
        <button class="delete" onclick="${opts.removeFn}('${g.id}')">×</button>
      </div>
    `;
  }).join('') : `<div class="empty">${opts.empty}</div>`;
}

function renderGuests() {
  guests = guests.map(normalizeGuest);

  const people = guests.reduce((s, g) => s + Number(g.qty || 0), 0);
  const enteredPeople = guests.reduce((s, g) => s + Number(g.entered || 0), 0);
  const pendingPeople = people - enteredPeople;

  $('guestCount').textContent = guests.length;
  $('peopleCount').textContent = people;
  $('attendedCount').textContent = enteredPeople;
  $('pendingCount').textContent = pendingPeople;

  renderList(guests, {
    searchId: 'searchInput',
    listId: 'list',
    toggleFn: 'toggle',
    setFn: 'setEntered',
    removeFn: 'removeGuest',
    empty: 'No hay invitados.'
  });
}

function renderVip() {
  vipGuests = vipGuests.map(normalizeGuest);

  const people = vipGuests.reduce((s, g) => s + Number(g.qty || 0), 0);
  const enteredPeople = vipGuests.reduce((s, g) => s + Number(g.entered || 0), 0);
  const pendingPeople = people - enteredPeople;

  $('vipGuestCount').textContent = vipGuests.length;
  $('vipPeopleCount').textContent = people;
  $('vipAttendedCount').textContent = enteredPeople;
  $('vipPendingCount').textContent = pendingPeople;

  renderList(vipGuests, {
    searchId: 'vipSearchInput',
    listId: 'vipList',
    toggleFn: 'toggleVip',
    setFn: 'setVipEntered',
    removeFn: 'removeVip',
    empty: 'No hay invitados VIP.',
    vip: true
  });
}

function renderBlacklist() {
  const q = $('blackSearchInput').value.trim().toLowerCase();
  const filtered = blacklist.filter(b =>
    b.name.toLowerCase().includes(q) ||
    String(b.note || '').toLowerCase().includes(q)
  );

  $('blackList').innerHTML = filtered.length ? filtered.map(b => `
    <div class="row black-row">
      <div class="info">
        <div class="name">${escapeHtml(b.name)}</div>
        <div class="sub">${b.note ? escapeHtml(b.note) : 'Sin nota'}</div>
      </div>
      <button class="delete" onclick="removeBlack('${b.id}')">×</button>
    </div>
  `).join('') : `<div class="empty">No hay personas en lista negra.</div>`;
}

function renderHistory() {
  const q = $('historySearchInput').value.trim().toLowerCase();

  const filtered = history.filter(h => {
    const byDate = String(h.date || '').toLowerCase().includes(q);
    const byGuest = (h.guests || []).some(g => String(g.name || '').toLowerCase().includes(q));
    return byDate || byGuest;
  });

  $('historyList').innerHTML = filtered.length ? filtered.map(h => {
    const list = (h.guests || []).map(normalizeGuest);
    const normalCount = list.filter(g => !g.vip).length;
    const vipCount = list.filter(g => g.vip).length;
    const people = list.reduce((s, g) => s + Number(g.qty || 0), 0);
    const entered = list.reduce((s, g) => s + Number(g.entered || 0), 0);
    const pending = people - entered;
    const isOpen = openHistory.has(h.id);

    return `
      <div class="history-card">
        <button class="history-toggle" onclick="toggleHistory('${h.id}')">
          <div>
            <div class="history-date">${formatDate(h.date)}</div>
            <div class="sub">Invitados ${normalCount} · VIP ${vipCount} · Personas ${people} · Ingresaron ${entered} · No ingresaron ${pending}</div>
          </div>
          <span class="history-plus">${isOpen ? '−' : '+'}</span>
        </button>

        <div class="history-guests ${isOpen ? '' : 'hidden'}">
          ${list.map(g => {
            const qty = Number(g.qty || 1);
            const ent = Number(g.entered || 0);
            const pend = qty - ent;
            const status = ent === 0 ? 'No vino' : ent >= qty ? 'Vino' : 'Parcial';

            return `
              <div class="history-line ${g.vip ? 'history-vip-line' : ''}">
                <div class="history-line-head">
                  <strong class="history-name">${escapeHtml(g.name)}</strong>
                  ${g.vip ? '<span class="vip-badge-inline">⭐ VIP</span>' : ''}
                </div>
                <span>${status} · ${ent}/${qty} · Pendientes ${pend}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('') : `<div class="empty">No hay historial todavía.</div>`;
}

function toggleHistory(id) {
  if (openHistory.has(id)) openHistory.delete(id);
  else openHistory.add(id);
  renderHistory();
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(date) {
  if (!date) return 'Sin fecha';
  const [y, m, d] = String(date).split('-');
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, m => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;'
  }[m]));
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

if (guests.length) renderGuests();
if (vipGuests.length) renderVip();
if (blacklist.length) renderBlacklist();
if (history.length) renderHistory();

load();
setInterval(() => load(), 3000);
window.addEventListener('focus', () => load());
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

window.toggle = toggle;
window.removeGuest = removeGuest;
window.setEntered = setEntered;
window.toggleVip = toggleVip;
window.removeVip = removeVip;
window.setVipEntered = setVipEntered;
window.removeBlack = removeBlack;
window.toggleHistory = toggleHistory;
