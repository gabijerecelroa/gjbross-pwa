import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Octokit } from '@octokit/rest';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;
const GIST_FILENAME = process.env.GIST_FILENAME || 'guests.json';
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

if (!GITHUB_TOKEN || !GIST_ID) {
  console.warn('Faltan GITHUB_TOKEN o GIST_ID en .env / Render env vars');
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

function requirePin(req, res, next) {
  const pin = req.headers['x-admin-pin'] || req.body?.pin;
  if (String(pin) !== String(ADMIN_PIN)) {
    return res.status(401).json({ error: 'PIN incorrecto' });
  }
  next();
}

async function readData() {
  const { data } = await octokit.gists.get({ gist_id: GIST_ID });
  const file = data.files?.[GIST_FILENAME];
  if (!file) return { guests: [] };
  try {
    return JSON.parse(file.content || '{"guests":[]}');
  } catch {
    return { guests: [] };
  }
}

async function writeData(data) {
  await octokit.gists.update({
    gist_id: GIST_ID,
    files: {
      [GIST_FILENAME]: {
        content: JSON.stringify(data, null, 2)
      }
    }
  });
}

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'GJBROSS' }));

app.get('/api/guests', async (req, res) => {
  try {
    const data = await readData();
    res.json({ guests: data.guests || [] });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer el Gist' });
  }
});

app.post('/api/guests', requirePin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const qty = Math.max(1, Number(req.body.qty || 1));
    if (!name) return res.status(400).json({ error: 'Falta nombre' });
    const data = await readData();
    const guest = {
      id: crypto.randomUUID(),
      name,
      qty,
      attended: false,
      createdAt: new Date().toISOString()
    };
    data.guests = [guest, ...(data.guests || [])];
    await writeData(data);
    res.json({ guest, guests: data.guests });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo agregar invitado' });
  }
});

app.patch('/api/guests/:id', requirePin, async (req, res) => {
  try {
    const data = await readData();
    let updated = null;
    data.guests = (data.guests || []).map((g) => {
      if (g.id !== req.params.id) return g;
      updated = { ...g, ...req.body, id: g.id };
      delete updated.pin;
      return updated;
    });
    if (!updated) return res.status(404).json({ error: 'Invitado no encontrado' });
    await writeData(data);
    res.json({ guest: updated, guests: data.guests });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo actualizar invitado' });
  }
});

app.delete('/api/guests/:id', requirePin, async (req, res) => {
  try {
    const data = await readData();
    data.guests = (data.guests || []).filter((g) => g.id !== req.params.id);
    await writeData(data);
    res.json({ guests: data.guests });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo borrar invitado' });
  }
});

app.listen(PORT, () => console.log(`GJBROSS listo en puerto ${PORT}`));
