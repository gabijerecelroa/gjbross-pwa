const $ = (id) => document.getElementById(id);
const CACHE_KEY = 'conexion_guests_cache';

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); }
  catch { return []; }
}

let guests = loadCache();
let pin = localStorage.getItem('gjbross_pin') || '';

$('pinInput').value = pin;
if (pin) $('pinCard').classList.add('hidden');

$('savePinBtn').onclick = () => {
  pin = $('pinInput').value.trim();
  localStorage.setItem('gjbross_pin', pin);
  $('pinCard').classList.add('hidden');
  load();
};

function saveCache() {
  localStorage.setItem(CACHE_KEY, JSON.stringify(guests));
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

async function load(silent = false) {
  try {
    const data = await api('/api/guests?t=' + Date.now());
    guests = (data.guests || []).map(normalizeGuest);
    saveCache();
    render();
  } catch (e) {
    if (guests.length) render();
    else $('list').innerHTML = `<div class="empty">No se pudo cargar la lista.</div>`;
  }
}

function normalizeGuest(g) {
  const qty = Math.max(1, Number(g.qty || 1));
  let entered = Number(g.entered ?? 0);

  if (g.attended && !g.entered) entered = qty;
  entered = Math.max(0, Math.min(qty, entered));

  return { ...g, qty, entered, attended: entered >= qty };
}

$('guestForm').onsubmit = async (e) => {
  e.preventDefault();

  const name = $('nameInput').value.trim();
  const qty = Math.max(1, Number($('qtyInput').value || 1));

  if (!pin) return alert('Primero coloca el PIN');
  if (!name) return;

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

$('searchInput').oninput = render;

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

    return `
      <div class="row ${done ? 'done' : ''}">
        <button class="check" onclick="toggle('${g.id}')">${done ? '✓' : '○'}</button>

        <div class="info">
          <div class="name">${escapeHtml(g.name)}</div>
          <div class="sub">
            Total ${qty} · Ingresaron ${entered} · Pendientes ${pending}
          </div>

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
load();
setInterval(() => load(true), 15000);

window.toggle = toggle;
window.removeGuest = removeGuest;
window.setEntered = setEntered;
