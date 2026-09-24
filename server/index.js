import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Session } from './session.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
const statics = { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 };
app.use(express.static(path.join(root, 'public'), statics));
app.use('/shared', express.static(path.join(root, 'shared'), statics));
app.use('/vendor/three', express.static(path.join(root, 'node_modules/three'), { ...statics, maxAge: '7d' }));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

const server = createServer(app);
const io = new Server(server, { serveClient: true, pingInterval: 10000, pingTimeout: 8000 });
const session = new Session(io);
io.on('connection', (socket) => session.connect(socket));

server.listen(PORT, HOST, () => {
  console.log(`PokerCrew läuft auf http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

const shutdown = () => {
  session.close();
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('uncaughtException', (err) => console.error('Unerwarteter Fehler:', err));
process.on('unhandledRejection', (err) => console.error('Unerwarteter Fehler:', err));
process.on('SIGTERM', shutdown);
