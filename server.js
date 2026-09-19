require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const DEFAULT_PIN = '123456';

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      password TEXT NOT NULL,
      laptop_name TEXT DEFAULT '',
      laptop_model TEXT DEFAULT '',
      laptop_price NUMERIC
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS entries (
      id SERIAL PRIMARY KEY,
      serial TEXT,
      amount NUMERIC NOT NULL,
      date TEXT NOT NULL,
      person TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
  `);
  const { rows } = await pool.query('SELECT id FROM config WHERE id = 1');
  if (rows.length === 0) {
    await pool.query('INSERT INTO config (id, password) VALUES (1, $1)', [DEFAULT_PIN]);
  }
}

async function getConfigRow() {
  const { rows } = await pool.query('SELECT * FROM config WHERE id = 1');
  return rows[0];
}

// ---------------- config ----------------
app.get('/api/config', async (req, res) => {
  try {
    const c = await getConfigRow();
    res.json({
      laptopName: c.laptop_name || '',
      laptopModel: c.laptop_model || '',
      laptopPrice: c.laptop_price !== null ? Number(c.laptop_price) : null
    });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

app.put('/api/config', async (req, res) => {
  try {
    const c = await getConfigRow();
    if (String(req.body.pin) !== String(c.password)) {
      return res.status(401).json({ error: 'invalid pin' });
    }
    await pool.query(
      'UPDATE config SET laptop_name = $1, laptop_model = $2, laptop_price = $3 WHERE id = 1',
      [req.body.laptopName || '', req.body.laptopModel || '', req.body.laptopPrice || null]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

app.post('/api/change-pin', async (req, res) => {
  try {
    const c = await getConfigRow();
    if (String(req.body.oldPin) !== String(c.password)) {
      return res.status(401).json({ error: 'invalid pin' });
    }
    if (!req.body.newPin || String(req.body.newPin).length < 4) {
      return res.status(400).json({ error: 'weak pin' });
    }
    await pool.query('UPDATE config SET password = $1 WHERE id = 1', [String(req.body.newPin)]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

// ---------------- entries ----------------
app.get('/api/entries', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM entries ORDER BY created_at DESC LIMIT 2000'
    );
    res.json(rows.map(r => ({
      id: r.id,
      serial: r.serial,
      amount: Number(r.amount),
      date: r.date,
      person: r.person,
      createdAt: Number(r.created_at)
    })));
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

app.post('/api/entries', async (req, res) => {
  try {
    const c = await getConfigRow();
    if (String(req.body.pin) !== String(c.password)) {
      return res.status(401).json({ error: 'invalid pin' });
    }
    const { serial, amount, date, person } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'invalid amount' });
    if (!date) return res.status(400).json({ error: 'invalid date' });
    if (!person) return res.status(400).json({ error: 'invalid person' });
    const createdAt = Date.now();
    await pool.query(
      'INSERT INTO entries (serial, amount, date, person, created_at) VALUES ($1, $2, $3, $4, $5)',
      [serial || null, Number(amount), date, person, createdAt]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

app.delete('/api/entries/:id', async (req, res) => {
  try {
    const c = await getConfigRow();
    if (String(req.body.pin) !== String(c.password)) {
      return res.status(401).json({ error: 'invalid pin' });
    }
    await pool.query('DELETE FROM entries WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

const PORT = process.env.PORT || 3000;
init()
  .then(() => {
    app.listen(PORT, () => console.log('Server running on port ' + PORT));
  })
  .catch(err => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });
