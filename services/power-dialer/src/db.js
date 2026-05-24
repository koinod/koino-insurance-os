import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Service-role client — bypasses RLS. Only the worker uses this; the UI
// reads via the user's authenticated supabase-js client and RLS policies.
export const db = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function getSession(id) {
  const { data, error } = await db
    .from('dial_sessions')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function insertAttempt(row) {
  const { data, error } = await db
    .from('call_attempts')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAttempt(id, patch) {
  const { error } = await db
    .from('call_attempts')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

export async function claimWinner(sessionId, attemptId) {
  const { data, error } = await db.rpc('claim_session_winner', {
    p_session_id: sessionId,
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  return data === true;
}

export async function releaseWinner(sessionId) {
  const { error } = await db.rpc('release_session_winner', { p_session_id: sessionId });
  if (error) throw error;
}

export async function logCompliance(row) {
  const { error } = await db.from('compliance_events').insert(row);
  if (error) throw error;
}

export async function getAbandonmentRate(agencyId) {
  const { data, error } = await db
    .from('dialer_abandonment_30d')
    .select('abandonment_rate')
    .eq('agency_id', agencyId)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.abandonment_rate ?? 0);
}

export async function pickFromNumber(agencyId, leadAreaCode) {
  // Prefer same area code, then any active number from the pool.
  let { data, error } = await db
    .from('phone_numbers')
    .select('e164')
    .eq('agency_id', agencyId)
    .eq('status', 'active')
    .eq('area_code', leadAreaCode)
    .limit(1);
  if (error) throw error;
  if (!data?.length) {
    ({ data, error } = await db
      .from('phone_numbers')
      .select('e164')
      .eq('agency_id', agencyId)
      .eq('status', 'active')
      .limit(1));
    if (error) throw error;
  }
  return data?.[0]?.e164 ?? null;
}

export async function endSession(id, status = 'ended') {
  const { error } = await db
    .from('dial_sessions')
    .update({ status, ended_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
