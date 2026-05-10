const $ = (id) => document.getElementById(id);

const GUEST_CACHE = 'conexion_guests_cache';
const BLACK_CACHE = 'conexion_blacklist_cache';

let guests = loadCache(GUEST_CACHE);
let blacklist = loadCache(BLACK_CACHE);
let pin = localStorage.getItem('gjbross_pin') || '';

$('pinInput').value = pin;
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

function showTab(tab) {
  const isBlack = tab === 'blacklist';

  $('guestPanel').classList.toggle('hidden', isBlack);
  $('blacklistPanel').classList.toggle('hidden', !isBlack);
  $('btnGuestsTab').classList.toggle('active', !isBlack);
  $('btnBlacklistTab').classList.toggle('active', isBlack);

  if (isBlack && !pin) $('pinCard').classList.remove('hidden');
}

function loadCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function saveCache() {
  localStorage.setItem(GUEST_CACHE, JSON.stringify(guests));
  localStorage.setItem(BLACK_CACHE, JSON.stringify(blacklist));
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
    } catch {
      if (!blacklist.length) $('blackList').innerHTML = `<div class="empty">No se pudo cargar la lista negra.</div>`;
    }
  }

  saveCache();
  render();
  renderBlacklist();
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
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
          <div class="name">
            ${escapeHtml(g.name)}
            ${black ? '<span class="badge-danger">LISTA NEGRA</span>' : ''}
          </div>
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

load();
setInterval(() => load(), 15000);

window.toggle = toggle;
window.removeGuest = removeGuest;
window.setEntered = setEntered;
window.removeBlack = removeBlack;
