const $ = (id) => document.getElementById(id);
const CACHE_KEY = 'gjbross_guests_cache';

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

function showLoading() {
  $('guestCount').textContent = '...';
  $('peopleCount').textContent = '...';
  $('attendedCount').textContent = '...';
  $('pendingCount').textContent = '...';
  $('list').innerHTML = `<div class="empty">Cargando invitados...</div>`;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin, ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
}

async function load(silent = false) {
  if (!silent && guests.length === 0) showLoading();

  try {
    const data = await api('/api/guests?t=' + Date.now());
    guests = data.guests || [];
    saveCache();
    render();
  } catch (e) {
    if (guests.length > 0) {
      render();
    } else {
      $('list').innerHTML = `<div class="empty">No se pudo cargar la lista. Reintentando...</div>`;
    }
  }
}

$('guestForm').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('nameInput').value.trim();
  const qty = Number($('qtyInput').value || 1);
  if (!pin) return alert('Primero coloca el PIN');
  if (!name) return;

  try {
    const data = await api('/api/guests', { method: 'POST', body: JSON.stringify({ name, qty }) });
    guests = data.guests || [];
    saveCache();
    $('nameInput').value = '';
    $('qtyInput').value = 1;
    render();
  } catch (e) {
    alert(e.message);
  }
};

$('searchInput').oninput = render;

async function toggle(id) {
  const guest = guests.find(g => g.id === id);
  if (!guest) return;

  const data = await api(`/api/guests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ attended: !guest.attended })
  });

  guests = data.guests || [];
  saveCache();
  render();
}

async function removeGuest(id) {
  if (!confirm('Borrar invitado?')) return;

  const data = await api(`/api/guests/${id}`, { method: 'DELETE' });
  guests = data.guests || [];
  saveCache();
  render();
}

function render() {
  const q = $('searchInput').value.trim().toLowerCase();
  const filtered = guests.filter(g => g.name.toLowerCase().includes(q));
  const people = guests.reduce((s, g) => s + Number(g.qty || 0), 0);
  const attended = guests.filter(g => g.attended).reduce((s, g) => s + Number(g.qty || 0), 0);

  $('guestCount').textContent = guests.length;
  $('peopleCount').textContent = people;
  $('attendedCount').textContent = attended;
  $('pendingCount').textContent = people - attended;

  $('list').innerHTML = filtered.length ? filtered.map(g => `
    <div class="row ${g.attended ? 'done' : ''}">
      <button class="check" onclick="toggle('${g.id}')">${g.attended ? '✓' : '○'}</button>
      <div class="info">
        <div class="name">${escapeHtml(g.name)}</div>
        <div class="sub">${g.qty} persona${g.qty == 1 ? '' : 's'} · ${g.attended ? 'Ya asistió' : 'Pendiente'}</div>
      </div>
      <button class="delete" onclick="removeGuest('${g.id}')">×</button>
    </div>`).join('') : `<div class="empty">No hay invitados.</div>`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

if (guests.length > 0) render();
else showLoading();

load();
setInterval(() => load(true), 15000);

window.toggle = toggle;
window.removeGuest = removeGuest;
