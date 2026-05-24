import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { logger } from './logger.js';
import { startSession, dialNext, endSessionById, onAmdResult, onStatusCallback } from './session.js';
import { db, getSession } from './db.js';
import { holdInLegRoom, bridgeRepResponse, divertAiResponse, voicemailResponse, abandonResponse } from './twiml.js';

const app = Fastify({ logger: false });
await app.register(websocket);

// ---------- health ----------
app.get('/healthz', async () => ({ ok: true, worker: config.workerId, ts: new Date().toISOString() }));

// ---------- session control (called by the web UI via signed fetch) ----------
app.post('/session/start', async (req, reply) => {
  const { agencyId, repId, maxLines, leadQueue, toggles } = req.body ?? {};
  if (!agencyId || !repId) return reply.code(400).send({ error: 'agencyId+repId required' });
  try {
    const out = await startSession({ agencyId, repId, maxLines, leadQueue, toggles });
    return out;
  } catch (e) {
    logger.error({ err: e }, 'startSession failed');
    return reply.code(500).send({ error: e.message });
  }
});

app.post('/session/:id/dial-next', async (req, reply) => {
  try { return await dialNext({ sessionId: req.params.id }); }
  catch (e) {
    logger.error({ err: e, sessionId: req.params.id }, 'dialNext failed');
    return reply.code(500).send({ error: e.message });
  }
});

app.post('/session/:id/end', async (req, reply) => {
  try { return await endSessionById(req.params.id); }
  catch (e) {
    logger.error({ err: e }, 'endSession failed');
    return reply.code(500).send({ error: e.message });
  }
});

// ---------- Twilio TwiML endpoints (fetched by Twilio on call events) ----------
function xml(reply, body) { reply.type('text/xml').send(body); }

app.post('/twiml/leg/:attemptId', async (req, reply) => {
  const { data: attempt } = await db.from('call_attempts').select('*').eq('id', req.params.attemptId).maybeSingle();
  if (!attempt) return xml(reply, abandonResponse());
  xml(reply, holdInLegRoom({ attempt }));
});

app.post('/twiml/bridge-rep/:attemptId', async (req, reply) => {
  const { data: attempt } = await db.from('call_attempts').select('*').eq('id', req.params.attemptId).maybeSingle();
  if (!attempt) return xml(reply, abandonResponse());
  const sess = await getSession(attempt.session_id);
  xml(reply, bridgeRepResponse({ attempt, sess }));
});

app.post('/twiml/divert-ai/:attemptId', async (req, reply) => {
  xml(reply, divertAiResponse({ attemptId: req.params.attemptId }));
});

app.post('/twiml/voicemail/:attemptId', async (req, reply) => {
  xml(reply, voicemailResponse({ attemptId: req.params.attemptId }));
});

app.post('/twiml/abandon/:attemptId', async (_req, reply) => {
  xml(reply, abandonResponse());
});

// ---------- Twilio webhooks ----------
app.post('/webhook/twilio/status', async (req, reply) => {
  // Form-encoded; fastify needs the urlencoded body parser
  const params = req.body ?? {};
  const sid = params.CallSid;
  const status = params.CallStatus;
  const durationSec = Number(params.CallDuration ?? 0) || null;
  try { await onStatusCallback({ sid, status, durationSec }); }
  catch (e) { logger.error({ err: e }, 'status callback handler failed'); }
  reply.send({ ok: true });
});

app.post('/webhook/twilio/amd', async (req, reply) => {
  const params = req.body ?? {};
  const sid = params.CallSid;
  const amd = params.AnsweredBy; // human|machine_start|machine_end_beep|fax|unknown
  // Resolve attempt by SID
  const { data: attempt } = await db.from('call_attempts').select('id').eq('twilio_call_sid', sid).maybeSingle();
  if (!attempt) return reply.send({ ignored: true });
  try { await onAmdResult({ attemptId: attempt.id, amd }); }
  catch (e) { logger.error({ err: e }, 'amd handler failed'); }
  reply.send({ ok: true });
});

app.post('/webhook/twilio/recording', async (req, reply) => {
  const params = req.body ?? {};
  const sid = params.CallSid;
  const recordingUrl = params.RecordingUrl;
  if (recordingUrl) {
    const { data: attempt } = await db.from('call_attempts').select('id').eq('twilio_call_sid', sid).maybeSingle();
    if (attempt) {
      await db.from('call_attempts').update({ recording_url: recordingUrl }).eq('id', attempt.id);
    }
  }
  reply.send({ ok: true });
});

// Allow Twilio's form-encoded webhooks
app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
  const out = {};
  for (const pair of String(body).split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  done(null, out);
});

// ---------- start ----------
try {
  await app.listen({ host: config.host, port: config.port });
  logger.info({ port: config.port, publicUrl: config.publicUrl }, 'power-dialer listening');
} catch (e) {
  logger.error({ err: e }, 'failed to start');
  process.exit(1);
}
