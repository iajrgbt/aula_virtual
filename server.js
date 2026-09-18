require('dotenv').config();
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Base de datos (persistente en /app/data) ---
const db = new Database(path.join(__dirname, 'data', 'aula.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  curso TEXT NOT NULL,
  fecha TEXT NOT NULL,
  sala TEXT NOT NULL UNIQUE,
  creada_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conexiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sesion_id INTEGER NOT NULL,
  dni TEXT NOT NULL,
  nombre TEXT,
  hora_entrada TEXT NOT NULL,
  hora_salida TEXT,
  duracion_segundos INTEGER,
  camara_incidencias INTEGER DEFAULT 0,
  FOREIGN KEY (sesion_id) REFERENCES sesiones(id)
);
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===================== ZONA ALUMNO (pública) =====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// El alumno "entra" -> se abre el registro de conexión
app.post('/api/join', (req, res) => {
  const { dni, nombre, sala } = req.body;
  if (!dni || !nombre || !sala) return res.status(400).json({ error: 'Faltan datos' });

  const sesion = db.prepare('SELECT * FROM sesiones WHERE sala = ?').get(sala.trim());
  if (!sesion) return res.status(404).json({ error: 'Código de sala no válido' });

  const horaEntrada = new Date().toISOString();
  const info = db.prepare(
    'INSERT INTO conexiones (sesion_id, dni, nombre, hora_entrada) VALUES (?, ?, ?, ?)'
  ).run(sesion.id, dni.trim().toUpperCase(), nombre.trim(), horaEntrada);

  res.json({ conexionId: info.lastInsertRowid, sala: sesion.sala });
});

// El alumno "sale" -> se cierra el registro y se calcula duración
app.post('/api/leave', (req, res) => {
  const { conexionId } = req.body;
  if (!conexionId) return res.status(400).json({ error: 'Falta conexionId' });

  const conexion = db.prepare('SELECT * FROM conexiones WHERE id = ?').get(conexionId);
  if (!conexion || conexion.hora_salida) return res.json({ ok: true });

  const horaSalida = new Date().toISOString();
  const duracion = Math.round((new Date(horaSalida) - new Date(conexion.hora_entrada)) / 1000);

  db.prepare('UPDATE conexiones SET hora_salida = ?, duracion_segundos = ? WHERE id = ?')
    .run(horaSalida, duracion, conexionId);

  res.json({ ok: true });
});

// Se registra cada vez que un alumno apaga la cámara (incidencia)
app.post('/api/incidencia-camara', (req, res) => {
  const { conexionId } = req.body;
  if (conexionId) {
    db.prepare('UPDATE conexiones SET camara_incidencias = camara_incidencias + 1 WHERE id = ?')
      .run(conexionId);
  }
  res.json({ ok: true });
});

app.get('/aula/:sala', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'aula.html'));
});

// ===================== ZONA PROTEGIDA =====================

const adminAuth = basicAuth({
  users: { admin: process.env.ADMIN_PASSWORD || 'cambia-esto' },
  challenge: true,
  realm: 'Panel de administracion',
});

const inspectorAuth = basicAuth({
  users: { inspector: process.env.INSPECTOR_PASSWORD || 'cambia-esto-tambien' },
  challenge: true,
  realm: 'Acceso de inspeccion',
});

// --- Admin: crear sesiones/clases ---
app.get('/admin', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/api/admin/sesiones', adminAuth, (req, res) => {
  const { curso, fecha } = req.body;
  const sala = 'cap-' + Math.random().toString(36).slice(2, 10);
  const info = db.prepare('INSERT INTO sesiones (curso, fecha, sala) VALUES (?, ?, ?)')
    .run(curso, fecha, sala);
  res.json({ id: info.lastInsertRowid, sala });
});

app.get('/api/admin/sesiones', adminAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM sesiones ORDER BY id DESC').all());
});

// --- Inspector: acceso en tiempo real + histórico (2 años) ---
app.get('/inspector', inspectorAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'inspector.html'));
});

app.get('/api/inspector/en-vivo', inspectorAuth, (req, res) => {res.set('Cache-Control', 'no-store');
  const rows = db.prepare(`
    SELECT c.*, s.curso, s.sala FROM conexiones c
    JOIN sesiones s ON s.id = c.sesion_id
    WHERE c.hora_salida IS NULL
    ORDER BY c.hora_entrada DESC
  `).all();
  res.json(rows);
});

app.get('/api/inspector/historico', inspectorAuth, (req, res) => {res.set('Cache-Control', 'no-store');
  const rows = db.prepare(`
    SELECT c.*, s.curso, s.fecha, s.sala FROM conexiones c
    JOIN sesiones s ON s.id = c.sesion_id
    ORDER BY c.hora_entrada DESC
    LIMIT 2000
  `).all();
  res.json(rows);
});

app.get('/api/inspector/historico.csv', inspectorAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.dni, c.nombre, s.curso, s.fecha, s.sala, c.hora_entrada, c.hora_salida, c.duracion_segundos, c.camara_incidencias
    FROM conexiones c JOIN sesiones s ON s.id = c.sesion_id
    ORDER BY c.hora_entrada DESC
  `).all();

  const fecha = (iso) => iso ? new Date(iso).toLocaleString('es-ES') : '';
  const duracion = (seg) => seg ? `${Math.floor(seg / 60)} min ${seg % 60} seg` : '';

  const header = ['DNI', 'Nombre', 'Curso', 'Fecha', 'Sala', 'Entrada', 'Salida', 'Duracion', 'Incidencias camara'];
  const filas = rows.map(r => [
    r.dni, r.nombre, r.curso, r.fecha, r.sala,
    fecha(r.hora_entrada), fecha(r.hora_salida), duracion(r.duracion_segundos), r.camara_incidencias
  ]);

  const csv = [header, ...filas]
    .map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="historico_conexiones.csv"');
  res.send('\uFEFF' + csv);
});

app.listen(PORT, () => console.log(`Aula virtual CAP escuchando en el puerto ${PORT}`));
