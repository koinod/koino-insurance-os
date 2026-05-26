// SignalWire implementation via LaML REST (Twilio-compatible API).
//
// SignalWire offers a TwiML-compatible markup called LaML and a REST API
// that mirrors Twilio's. Base URL is per-space:
//
//   https://<SIGNALWIRE_SPACE>.signalwire.com/api/laml/2010-04-01/...
//
// Auth: HTTP Basic. Username = Project ID, Password = API Token.
//
// Required env (read at first use, not at module load):
//   SIGNALWIRE_SPACE        — e.g. "koino" → koino.signalwire.com
//   SIGNALWIRE_PROJECT_ID   — UUID, looks like aaaaaaaa-bbbb-...
//   SIGNALWIRE_API_TOKEN    — PT-prefixed token
//
// AMD strategy: native (SignalWire supports MachineDetection same as Twilio).

export const providerName = 'signalwire';
export const amdSupport = 'native';

function creds() {
  const space = process.env.SIGNALWIRE_SPACE;
  const projectId = process.env.SIGNALWIRE_PROJECT_ID;
  const apiToken = process.env.SIGNALWIRE_API_TOKEN;
  if (!space || !projectId || !apiToken) {
    throw new Error('SIGNALWIRE_{SPACE,PROJECT_ID,API_TOKEN} not all set — fill in .env.local');
  }
  const base = `https://${space}.signalwire.com/api/laml/2010-04-01/Accounts/${projectId}`;
  const auth = 'Basic ' + Buffer.from(`${projectId}:${apiToken}`).toString('base64');
  return { base, auth, projectId };
}

async function postForm(path, params) {
  const { base, auth } = creds();
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`signalwire ${r.status}: ${json.message || JSON.stringify(json).slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  return json;
}

export async function placeOutbound({
  from, to, attemptId, record,
  twimlUrl, statusCallbackUrl, amdCallbackUrl, recordingCallbackUrl, amdTimeoutMs,
}) {
  const params = {
    To: to, From: from,
    Url: twimlUrl, Method: 'POST',
    StatusCallback: statusCallbackUrl,
    StatusCallbackEvent: 'initiated ringing answered completed',
    StatusCallbackMethod: 'POST',
    MachineDetection: 'DetectMessageEnd',
    AsyncAmd: 'true',
    AsyncAmdStatusCallback: amdCallbackUrl,
    AsyncAmdStatusCallbackMethod: 'POST',
    MachineDetectionTimeout: String(Math.ceil(amdTimeoutMs / 1000)),
  };
  if (record) {
    params.Record = 'true';
    params.RecordingStatusCallback = recordingCallbackUrl;
    params.RecordingStatusCallbackMethod = 'POST';
  }
  const data = await postForm('/Calls.json', params);
  return { sid: data.sid };
}

export async function hangup(sid) {
  if (!sid) return;
  try {
    await postForm(`/Calls/${encodeURIComponent(sid)}.json`, { Status: 'completed' });
  } catch (e) {
    if (e.status !== 404) throw e;
  }
}

export async function redirect(sid, newUrl) {
  await postForm(`/Calls/${encodeURIComponent(sid)}.json`, {
    Url: newUrl, Method: 'POST',
  });
}

export async function sendSms({ from, to, body }) {
  if (!from || !to || !body) return { sent: false, error: 'missing_to_from_or_body' };
  try {
    const data = await postForm('/Messages.json', { From: from, To: to, Body: body });
    return { sent: true, id: data.sid };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}
