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
const ADMIN_PIN = process.env.ADMIN_PIN || '2536';

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

  let parsed = { guests: [], blacklist: [], history: [] };

  if (file?.content) {
    try { parsed = JSON.parse(file.content); } catch {}
  }

  return {
    guests: parsed.guests || [],
    blacklist: parsed.blacklist || [],
    history: parsed.history || []
  };
}

async function writeData(data) {
  await octokit.gists.update({
    gist_id: GIST_ID,
    files: {
      [GIST_FILENAME]: {
        content: JSON.stringify({
          guests: data.guests || [],
          blacklist: data.blacklist || [],
          history: data.history || []
        }, null, 2)
      }
    }
  });
}

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'CONEXION' }));

app.get('/api/guests', async (req, res) => {
  try {
    const data = await readData();
    res.json({ guests: data.guests || [] });
  } catch {
    res.status(500).json({ error: 'No se pudo leer la lista' });
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
      entered: 0,
      attended: false,
      createdAt: new Date().toISOString()
    };

    data.guests = [guest, ...(data.guests || [])];

    await writeData(data);
    res.json({ guest, guests: data.guests });
  } catch {
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
  } catch {
    res.status(500).json({ error: 'No se pudo actualizar invitado' });
  }
});

app.delete('/api/guests/:id', requirePin, async (req, res) => {
  try {
    const data = await readData();
    data.guests = (data.guests || []).filter((g) => g.id !== req.params.id);

    await writeData(data);
    res.json({ guests: data.guests });
  } catch {
    res.status(500).json({ error: 'No se pudo borrar invitado' });
  }
});

app.post('/api/close-list', requirePin, async (req, res) => {
  try {
    const data = await readData();
    const guests = data.guests || [];

    if (!guests.length) {
      return res.status(400).json({ error: 'La lista está vacía' });
    }

    const date = String(req.body.date || new Date().toISOString().slice(0, 10));

    const item = {
      id: crypto.randomUUID(),
      date,
      closedAt: new Date().toISOString(),
      guests: guests.map(g => ({
        ...g,
        qty: Math.max(1, Number(g.qty || 1)),
        entered: Math.max(0, Number(g.entered || 0)),
        attended: Number(g.entered || 0) >= Number(g.qty || 1)
      }))
    };

    data.history = [item, ...(data.history || [])];
    data.guests = [];

    await writeData(data);

    res.json({
      item,
      guests: data.guests,
      history: data.history
    });
  } catch {
    res.status(500).json({ error: 'No se pudo cerrar la lista' });
  }
});

app.get('/api/history', requirePin, async (req, res) => {
  try {
    const data = await readData();
    res.json({ history: data.history || [] });
  } catch {
    res.status(500).json({ error: 'No se pudo leer el historial' });
  }
});

app.get('/api/blacklist', requirePin, async (req, res) => {
  try {
    const data = await readData();
    res.json({ blacklist: data.blacklist || [] });
  } catch {
    res.status(500).json({ error: 'No se pudo leer la lista negra' });
  }
});

app.post('/api/blacklist', requirePin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const note = String(req.body.note || '').trim();

    if (!name) return res.status(400).json({ error: 'Falta nombre' });

    const data = await readData();

    const item = {
      id: crypto.randomUUID(),
      name,
      note,
      createdAt: new Date().toISOString()
    };

    data.blacklist = [item, ...(data.blacklist || [])];

    await writeData(data);
    res.json({ item, blacklist: data.blacklist });
  } catch {
    res.status(500).json({ error: 'No se pudo agregar a lista negra' });
  }
});

app.delete('/api/blacklist/:id', requirePin, async (req, res) => {
  try {
    const data = await readData();
    data.blacklist = (data.blacklist || []).filter((b) => b.id !== req.params.id);

    await writeData(data);
    res.json({ blacklist: data.blacklist });
  } catch {
    res.status(500).json({ error: 'No se pudo borrar de lista negra' });
  }
});

app.listen(PORT, () => console.log(`CONEXION listo en puerto ${PORT}`));
