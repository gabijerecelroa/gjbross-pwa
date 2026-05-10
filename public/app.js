const $ = (id) => document.getElementById(id);

const GUEST_CACHE = 'conexion_guests_cache';
const BLACK_CACHE = 'conexion_blacklist_cache';
const HISTORY_CACHE = 'conexion_history_cache';

let guests = loadCache(GUEST_CACHE);
let blacklist = loadCache(BLACK_CACHE);
let history = loadCache(HISTORY_CACHE);
let openHistory = new Set();
let pin = localStorage.getItem('gjbross_pin') || '';

$('pinInput').value = pin;
$('closeDateInput').value = today();

if (pin) $('pinCard').classList.add('hidden');
else $('pinCard').classList.remove('hidden');

$('savePinBtn').onclick = () => {
  pin = $('pinInput').value.trim();
  localStorage.setItem('gjbross_pin', pin);
  $('pinCard').classList.add('hidden');
  load();
};

$('btnGuestsTab').onclick = () => showTab('guests');
$('btnBlacklistTab').onclick = () => showTab('blacklist');
$('btnHistoryTab').onclick = () => showTab('history');
$('closeListBtn').onclick = closeList;

function showTab(tab) {
  const black = tab === 'blacklist';
  const hist = tab === 'history';

  $('guestPanel').classList.toggle('hidden', black || hist);
  $('blacklistPanel').classList.toggle('hidden', !black);
  $('historyPanel').classList.toggle('hidden', !hist);

  $('btnGuestsTab').classList.toggle('active', tab === 'guests');
  $('btnBlacklistTab').classList.toggle('active', black);
  $('btnHistoryTab').classList.toggle('active', hist);

  if ((black || hist) && !pin) $('pinCard').classList.remove('hidden');
}

function loadCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function saveCache() {
  localStorage.setItem(GUEST_CACHE, JSON.stringify(guests));
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
      const dataBlack = await api('/api/blacklist?t=' + Date.now());
      blacklist = dataBlack.blacklist || [];
    } catch {}

    try {
      const dataHistory = await api('/api/history?t=' + Date.now());
      history = dataHistory.history || [];
    } catch {}
  }

  saveCache();
  render();
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

    render();
  } catch (e) {
    alert(e.message);
  }
};

async function closeList() {
  if (!pin) return alert('Primero coloca el PIN');
  if (!guests.length) return alert('La lista está vacía');

  const date = $('closeDateInput').value || today();

  const ok = confirm('Cerrar la lista de ' + formatDate(date) + '? Se guardará en historial y se vaciará la lista actual.');
  if (!ok) return;

  try {
    const data = await api('/api/close-list', {
      method: 'POST',
      body: JSON.stringify({ date })
    });

    guests = (data.guests || []).map(normalizeGuest);
    history = data.history || [];

    saveCache();
    render();
    renderHistory();
    alert('Lista cerrada y guardada en historial.');
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

$('searchInput').oninput = render;
$('blackSearchInput').oninput = renderBlacklist;
$('historySearchInput').oninput = renderHistory;

async function setEntered(id, value) {
  const guest = guests.find(g => g.id === id);
  if (!guest) return;

  const qty = Math.max(1, Number(guest.qty || 1));
  const entered = Math.max(0, Math.min(qty, Number(value || 0)));

  const data = await api(`/api/guests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      entered,
      attended: entered >= qty
    })
  });

  guests = (data.guests || []).map(normalizeGuest);
  saveCache();
  render();
}

async function toggle(id) {
  const guest = guests.find(g => g.id === id);
  if (!guest) return;

  const qty = Math.max(1, Number(guest.qty || 1));
  const entered = Number(guest.entered || 0) >= qty ? 0 : qty;

  await setEntered(id, entered);
}

async function removeGuest(id) {
  if (!confirm('Borrar invitado?')) return;

  const data = await api(`/api/guests/${id}`, { method: 'DELETE' });
  guests = (data.guests || []).map(normalizeGuest);

  saveCache();
  render();
}

async function removeBlack(id) {
  if (!confirm('Borrar de lista negra?')) return;

  const data = await api(`/api/blacklist/${id}`, { method: 'DELETE' });
  blacklist = data.blacklist || [];

  saveCache();
  renderBlacklist();
}

function render() {
  guests = guests.map(normalizeGuest);

  const q = $('searchInput').value.trim().toLowerCase();
  const filtered = guests.filter(g => g.name.toLowerCase().includes(q));

  const people = guests.reduce((s, g) => s + Number(g.qty || 0), 0);
  const enteredPeople = guests.reduce((s, g) => s + Number(g.entered || 0), 0);
  const pendingPeople = people - enteredPeople;

  $('guestCount').textContent = guests.length;
  $('peopleCount').textContent = people;
  $('attendedCount').textContent = enteredPeople;
  $('pendingCount').textContent = pendingPeople;

  $('list').innerHTML = filtered.length ? filtered.map(g => {
    const qty = Number(g.qty || 1);
    const entered = Number(g.entered || 0);
    const pending = qty - entered;
    const done = entered >= qty;
    const black = isBlacklisted(g.name);

    return `
      <div class="row ${done ? 'done' : ''} ${black ? 'black-alert' : ''}">
        <button class="check" onclick="toggle('${g.id}')">${done ? '✓' : '○'}</button>
        <div class="info">
          <div class="name">${escapeHtml(g.name)} ${black ? '<span class="badge-danger">LISTA NEGRA</span>' : ''}</div>
          <div class="sub">Total ${qty} · Ingresaron ${entered} · Pendientes ${pending}</div>
          <div class="entry-controls">
            <button onclick="setEntered('${g.id}', ${entered - 1})">-</button>
            <span>${entered}/${qty}</span>
            <button onclick="setEntered('${g.id}', ${entered + 1})">+</button>
          </div>
        </div>
        <button class="delete" onclick="removeGuest('${g.id}')">×</button>
      </div>
    `;
  }).join('') : `<div class="empty">No hay invitados.</div>`;
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
    const people = list.reduce((s, g) => s + Number(g.qty || 0), 0);
    const entered = list.reduce((s, g) => s + Number(g.entered || 0), 0);
    const pending = people - entered;
    const isOpen = openHistory.has(h.id);

    return `
      <div class="history-card">
        <button class="history-toggle" onclick="toggleHistory('${h.id}')">
          <div>
            <div class="history-date">${formatDate(h.date)}</div>
            <div class="sub">Invitados ${list.length} · Personas ${people} · Ingresaron ${entered} · No ingresaron ${pending}</div>
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
              <div class="history-line">
                <strong>${escapeHtml(g.name)}</strong>
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

if (guests.length) render();
if (blacklist.length) renderBlacklist();
if (history.length) renderHistory();

load();
setInterval(() => load(), 3000);
window.addEventListener('focus', () => load());
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

window.toggle = toggle;
window.removeGuest = removeGuest;
window.setEntered = setEntered;
window.removeBlack = removeBlack;
window.toggleHistory = toggleHistory;
