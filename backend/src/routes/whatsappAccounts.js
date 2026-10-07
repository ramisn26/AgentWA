const { Router } = require('express');
const pool = require('../db');
const { encrypt, decrypt, maskSecret } = require('../util/crypto');
const { adminOnly } = require('../middleware/access');
const { isAdmin } = require('../permissions');

const router = Router();

/**
 * Look up a phone number's human-readable number + verified business name from
 * the Meta Graph API. The simplified connection form no longer asks the user to
 * type these, so we derive them from the Phone Number ID + access token. Also
 * doubles as a credential check. Throws on a non-2xx Meta response.
 */
async function fetchPhoneMeta(phoneNumberId, accessToken) {
  const version = process.env.META_API_VERSION || 'v21.0';
  const apiUrl = `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`;
  const resp = await fetch(apiUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  const text = await resp.text();
  let body = {};
  try { body = JSON.parse(text); } catch { /* non-JSON error body */ }
  if (!resp.ok) {
    throw new Error(body?.error?.message || text || `HTTP ${resp.status}`);
  }
  return body; // { display_phone_number, verified_name, id }
}

// Serialise an account row for the API. Secrets — the masked access token and
// the webhook verify token — are ONLY included for admins (`includeSecrets`).
// The full (decrypted) access token is never sent over the API at all.
function publicShape(row, { includeSecrets = false } = {}) {
  if (!row) return null;
  const out = {
    id: row.id,
    displayName: row.display_name,
    displayPhoneNumber: row.display_phone_number,
    phoneNumberId: row.phone_number_id,
    wabaId: row.waba_id,
    metaAppId: row.meta_app_id,
    isDefault: row.is_default,
    isActive: row.is_active,
    healthStatus: row.health_status || 'unknown',
    lastErrorAt: row.last_error_at,
    lastErrorMessage: row.last_error_message,
    lastSuccessAt: row.last_success_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeSecrets) {
    out.accessTokenMasked = maskSecret(decrypt(row.access_token_encrypted));
    out.verifyToken = row.verify_token_encrypted ? decrypt(row.verify_token_encrypted) : '';
  }
  return out;
}

// List all accounts (any authenticated user — needed for template/broadcast pickers)
router.get('/whatsapp-accounts', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM coexistence.whatsapp_accounts
        WHERE ($1::boolean IS NULL OR is_active = $1)
        ORDER BY is_default DESC, display_name ASC`,
      [req.query.activeOnly === 'true' ? true : null]
    );
    const includeSecrets = isAdmin(req.user);
    res.json(rows.map(r => publicShape(r, { includeSecrets })));
  } catch (err) {
    console.error('[whatsapp-accounts] list error:', err.message);
    res.status(500).json({ error: 'Failed to list WhatsApp Business accounts' });
  }
});

// Resolve account by phone (must be registered before :id so it doesn't match :id=by-phone)
router.get('/whatsapp-accounts/by-phone/:phone', async (req, res) => {
  try {
    const acc = await getAccountByPhoneNumber(req.params.phone);
    if (!acc) return res.status(404).json({ error: 'No WhatsApp Business account registered for this phone' });
    res.json({
      id: acc.id,
      displayName: acc.displayName,
      displayPhoneNumber: acc.displayPhoneNumber,
      phoneNumberId: acc.phoneNumberId,
      wabaId: acc.wabaId,
      isActive: acc.isActive,
    });
  } catch (err) {
    console.error('[whatsapp-accounts] by-phone error:', err.message);
    res.status(500).json({ error: 'Failed to resolve account' });
  }
});

// Get one — admin only; returns the masked token + verify token (never the
// full access token).
router.get('/whatsapp-accounts/:id', adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM coexistence.whatsapp_accounts WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(publicShape(rows[0], { includeSecrets: true }));
  } catch (err) {
    console.error('[whatsapp-accounts] get error:', err.message);
    res.status(500).json({ error: 'Failed to fetch WhatsApp Business account' });
  }
});

router.post('/whatsapp-accounts', adminOnly, async (req, res) => {
  try {
    const { phoneNumberId, wabaId, accessToken, verifyToken, metaAppId } = req.body || {};
    if (!phoneNumberId || !wabaId || !accessToken) {
      return res.status(400).json({ error: 'Phone Number ID, WhatsApp Business Account ID and Permanent Access Token are required' });
    }

    // Best-effort: resolve the human-readable number + verified business name
    // from Meta so chat threading and display still work without the user
    // typing them. Saving proceeds even if the lookup fails (logged).
    let displayName = `WhatsApp ${wabaId.trim()}`;
    let displayPhoneNumber = '';
    try {
      const meta = await fetchPhoneMeta(phoneNumberId.trim(), accessToken.trim());
      if (meta.verified_name) displayName = meta.verified_name;
      if (meta.display_phone_number) displayPhoneNumber = String(meta.display_phone_number).replace(/\D/g, '');
    } catch (e) {
      // Don't save a half-working account. The lookup doubles as a credential
      // check, so a failure here means the Phone Number ID + token combination
      // can't talk to Meta (wrong ID, wrong app, or an expired token — a Meta
      // *test number*'s token expires every 24h). Surface Meta's reason.
      console.warn('[whatsapp-accounts] Meta credential check failed:', e.message);
      return res.status(400).json({
        error: `Couldn't verify this WhatsApp number with Meta. Double-check your Phone Number ID and access token (a test number's token expires every 24 hours). Meta said: ${e.message}`,
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // The first account becomes the default; later ones are added as
      // non-default (only one default row is allowed by a unique index).
      const { rows: cnt } = await client.query('SELECT COUNT(*)::int AS n FROM coexistence.whatsapp_accounts');
      const makeDefault = cnt[0].n === 0;
      const { rows } = await client.query(
        `INSERT INTO coexistence.whatsapp_accounts
          (display_name, display_phone_number, phone_number_id, waba_id, meta_app_id,
           access_token_encrypted, verify_token_encrypted, is_default, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
         RETURNING *`,
        [
          displayName, displayPhoneNumber, phoneNumberId.trim(), wabaId.trim(),
          metaAppId?.trim() || null,
          encrypt(accessToken.trim()), encrypt((verifyToken || '').trim()),
          makeDefault,
        ]
      );
      await client.query('COMMIT');
      res.status(201).json(publicShape(rows[0], { includeSecrets: true }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This Phone Number ID is already connected' });
    console.error('[whatsapp-accounts] create error:', err.message);
    res.status(500).json({ error: 'Failed to create WhatsApp Business account' });
  }
});

/* ------------------------------------------------------------------ *
 * Embedded Signup (incl. coexistence / "connect existing WhatsApp
 * Business app"). The browser runs Meta's popup and hands us the
 * short-lived `code` + the WABA / phone number IDs from the session
 * message; we exchange the code for a business token, subscribe our app
 * to the WABA's webhooks, save the account and (for coexistence) ask Meta
 * to start the contacts + history sync — which must be requested within
 * 24 hours of onboarding.
 * Env: META_APP_ID, META_EMBEDDED_SIGNUP_CONFIG_ID, and the app secret in
 * META_EMBEDDED_APP_SECRET (falls back to the first META_APP_SECRET).
 * ------------------------------------------------------------------ */
function metaVersion() { return process.env.META_EMBEDDED_API_VERSION || 'v25.0'; }

function embeddedAppSecret() {
  if (process.env.META_EMBEDDED_APP_SECRET) return process.env.META_EMBEDDED_APP_SECRET.trim();
  return String(process.env.META_APP_SECRET || '').split(',').map(s => s.trim()).filter(Boolean)[0] || '';
}

async function graphJson(url, opts = {}) {
  const resp = await fetch(url, opts);
  const text = await resp.text();
  let body = {};
  try { body = JSON.parse(text); } catch { /* non-JSON */ }
  if (!resp.ok) throw new Error(body?.error?.message || text || `HTTP ${resp.status}`);
  return body;
}

router.get('/whatsapp-accounts/embedded-signup/config', adminOnly, (req, res) => {
  const appId = (process.env.META_APP_ID || '').trim();
  const configId = (process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || '').trim();
  res.json({ enabled: !!(appId && configId && embeddedAppSecret()), appId, configId, apiVersion: metaVersion() });
});

router.post('/whatsapp-accounts/embedded-signup', adminOnly, async (req, res) => {
  const { code, wabaId, phoneNumberId, coexistence } = req.body || {};
  const appId = (process.env.META_APP_ID || '').trim();
  const appSecret = embeddedAppSecret();
  if (!appId || !appSecret) {
    return res.status(500).json({ error: 'Embedded Signup is not configured on the server (META_APP_ID / app secret missing)' });
  }
  if (!code) {
    return res.status(400).json({ error: 'code is required' });
  }
  let waba = String(wabaId || '').trim();
  let phoneId = String(phoneNumberId || '').trim();
  const v = metaVersion();

  try {
    // 1. code -> business token. Meta's documented call sends only client_id,
    //    client_secret and code (no redirect_uri). The codes expire after 30s.
    //    If that is rejected we retry with an empty and then an origin
    //    redirect_uri, which only matters on unusual dashboard setups.
    const origin = req.get('origin') || `https://${req.get('host')}`;
    let tokenResp = null;
    let lastErr = null;
    for (const redirectUri of [null, '', origin]) {
      const label = redirectUri === null ? 'omitted' : (redirectUri === '' ? 'empty' : 'origin');
      try {
        const params = { client_id: appId, client_secret: appSecret, code: String(code) };
        if (redirectUri !== null) params.redirect_uri = redirectUri;
        tokenResp = await graphJson(
          `https://graph.facebook.com/${v}/oauth/access_token?` + new URLSearchParams(params)
        );
        console.log(`[embedded-signup] token exchange ok (redirect_uri=${label})`);
        break;
      } catch (e) {
        lastErr = e;
        console.warn(`[embedded-signup] token exchange failed (redirect_uri=${label}): ${e.message}`);
      }
    }
    if (!tokenResp) throw lastErr;
    const accessToken = tokenResp.access_token;
    if (!accessToken) throw new Error('Meta returned no access token');
    const auth = { Authorization: `Bearer ${accessToken}` };

    // 1b. no WABA from the browser session? Read it from the token's granted
    //     scopes (Meta's debug_token lists the WABAs this token can manage).
    if (!waba) {
      const dbg = await graphJson(
        `https://graph.facebook.com/${v}/debug_token?` + new URLSearchParams({
          input_token: accessToken, access_token: `${appId}|${appSecret}`,
        })
      );
      const scopes = dbg?.data?.granular_scopes || [];
      const ids = scopes
        .filter(sc => sc.scope === 'whatsapp_business_management')
        .flatMap(sc => sc.target_ids || []);
      if (!ids.length) throw new Error('Could not determine the WhatsApp Business Account from the signup token');
      const { rows: knownW } = await pool.query('SELECT waba_id FROM coexistence.whatsapp_accounts');
      const knownWabas = new Set(knownW.map(r => r.waba_id));
      waba = ids.find(id => !knownWabas.has(id)) || ids[0];
      console.log('[embedded-signup] WABA derived from token:', waba);
    }

    // 2. subscribe our app to this WABA's webhooks
    await graphJson(`https://graph.facebook.com/${v}/${encodeURIComponent(waba)}/subscribed_apps`, {
      method: 'POST', headers: auth,
    });

    // 2b. coexistence sessions may not include the phone number ID: look it up
    //     from the WABA (prefer a number we don't already have saved)
    if (!phoneId) {
      const list = await graphJson(
        `https://graph.facebook.com/${v}/${encodeURIComponent(waba)}/phone_numbers?fields=id,display_phone_number`,
        { headers: auth }
      );
      const nums = list.data || [];
      if (!nums.length) throw new Error('No phone number found on this WhatsApp Business Account yet');
      const { rows: known } = await pool.query('SELECT phone_number_id FROM coexistence.whatsapp_accounts');
      const knownIds = new Set(known.map(r => r.phone_number_id));
      phoneId = (nums.find(n => !knownIds.has(n.id)) || nums[0]).id;
    }

    // 3. resolve display name / number (also proves the token works)
    const meta = await fetchPhoneMeta(phoneId, accessToken);
    const displayName = meta.verified_name || `WhatsApp ${waba}`;
    const displayPhoneNumber = meta.display_phone_number ? String(meta.display_phone_number).replace(/\D/g, '') : '';

    // 4. save (re-onboarding the same number refreshes its token)
    const crypto = require('crypto');
    const verifyToken = crypto.randomBytes(16).toString('hex');
    const client = await pool.connect();
    let row;
    try {
      await client.query('BEGIN');
      const { rows: existing } = await client.query(
        'SELECT id FROM coexistence.whatsapp_accounts WHERE phone_number_id = $1', [phoneId]
      );
      if (existing.length) {
        const r = await client.query(
          `UPDATE coexistence.whatsapp_accounts
              SET waba_id=$1, meta_app_id=$2, access_token_encrypted=$3, display_name=$4,
                  display_phone_number=$5, is_active=TRUE, updated_at=NOW()
            WHERE id=$6 RETURNING *`,
          [waba, appId, encrypt(accessToken), displayName, displayPhoneNumber, existing[0].id]
        );
        row = r.rows[0];
      } else {
        const { rows: cnt } = await client.query('SELECT COUNT(*)::int AS n FROM coexistence.whatsapp_accounts');
        const r = await client.query(
          `INSERT INTO coexistence.whatsapp_accounts
             (display_name, display_phone_number, phone_number_id, waba_id, meta_app_id,
              access_token_encrypted, verify_token_encrypted, is_default, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING *`,
          [displayName, displayPhoneNumber, phoneId, waba, appId,
           encrypt(accessToken), encrypt(verifyToken), cnt[0].n === 0]
        );
        row = r.rows[0];
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // 5. coexistence: request contacts + history sync (best-effort; 24h window)
    const sync = {};
    if (coexistence) {
      for (const syncType of ['smb_app_state_sync', 'history']) {
        try {
          await graphJson(`https://graph.facebook.com/${v}/${encodeURIComponent(phoneId)}/smb_app_data`, {
            method: 'POST',
            headers: { ...auth, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: syncType }),
          });
          sync[syncType] = 'requested';
        } catch (e) {
          console.warn(`[embedded-signup] ${syncType} sync request failed:`, e.message);
          sync[syncType] = `failed: ${e.message}`;
        }
      }
    }

    res.status(201).json({ account: publicShape(row, { includeSecrets: true }), sync });
  } catch (err) {
    console.error('[embedded-signup] failed:', err.message);
    res.status(400).json({ error: `Embedded Signup failed: ${err.message}` });
  }
});

router.put('/whatsapp-accounts/:id', adminOnly, async (req, res) => {
  try {
    const { phoneNumberId, wabaId, accessToken, verifyToken, metaAppId, isActive } = req.body || {};
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: existingRows } = await client.query(
        'SELECT * FROM coexistence.whatsapp_accounts WHERE id = $1', [req.params.id]
      );
      if (existingRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Not found' });
      }
      const ex = existingRows[0];

      const newPhoneId = phoneNumberId != null ? phoneNumberId.trim() : ex.phone_number_id;
      const newWaba = wabaId != null ? wabaId.trim() : ex.waba_id;
      const tokenChanged = !!(accessToken && accessToken.trim());
      const effectiveToken = tokenChanged ? accessToken.trim() : decrypt(ex.access_token_encrypted);

      // Re-derive the display fields from Meta when the number or token changes.
      let displayName = ex.display_name;
      let displayPhoneNumber = ex.display_phone_number;
      if ((phoneNumberId != null && newPhoneId !== ex.phone_number_id) || tokenChanged) {
        try {
          const meta = await fetchPhoneMeta(newPhoneId, effectiveToken);
          if (meta.verified_name) displayName = meta.verified_name;
          if (meta.display_phone_number) displayPhoneNumber = String(meta.display_phone_number).replace(/\D/g, '');
        } catch (e) {
          // Same credential check as on connect: if the changed number/token
          // can't reach Meta, refuse the update and tell the user why instead
          // of silently keeping stale values.
          console.warn('[whatsapp-accounts] Meta credential check failed on update:', e.message);
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Couldn't verify this WhatsApp number with Meta. Double-check your Phone Number ID and access token (a test number's token expires every 24 hours). Meta said: ${e.message}`,
          });
        }
      }

      const sets = ['updated_at = NOW()'];
      const params = [];
      let i = 1;
      const push = (col, val) => { sets.push(`${col} = $${i++}`); params.push(val); };
      push('display_name', displayName);
      push('display_phone_number', displayPhoneNumber);
      push('phone_number_id', newPhoneId);
      push('waba_id', newWaba);
      if (metaAppId !== undefined) push('meta_app_id', metaAppId?.trim() || null);
      if (tokenChanged) {
        push('access_token_encrypted', encrypt(effectiveToken));
        // Reset health on token update so the UI banner clears.
        push('health_status', 'unknown');
        push('last_error_message', null);
      }
      if (verifyToken !== undefined) push('verify_token_encrypted', encrypt((verifyToken || '').trim()));
      if (isActive != null) push('is_active', !!isActive);
      params.push(req.params.id);
      const { rows } = await client.query(
        `UPDATE coexistence.whatsapp_accounts SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
        params
      );
      await client.query('COMMIT');
      res.json(publicShape(rows[0], { includeSecrets: true }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This Phone Number ID is already connected' });
    console.error('[whatsapp-accounts] update error:', err.message);
    res.status(500).json({ error: 'Failed to update WhatsApp Business account' });
  }
});

router.delete('/whatsapp-accounts/:id', adminOnly, async (req, res) => {
  try {
    // Never delete the last account — it would stop all sends. To switch
    // numbers, edit the existing account instead.
    const { rows: cnt } = await pool.query('SELECT COUNT(*)::int AS n FROM coexistence.whatsapp_accounts');
    if (cnt[0].n <= 1) {
      return res.status(409).json({ error: 'Cannot delete the only WhatsApp Business account. Edit it to change the connected number.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: del } = await client.query(
        'DELETE FROM coexistence.whatsapp_accounts WHERE id = $1 RETURNING is_default',
        [req.params.id]
      );
      if (del.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Not found' });
      }
      // If the default account was removed, promote the oldest remaining one.
      if (del[0].is_default) {
        await client.query(
          `UPDATE coexistence.whatsapp_accounts SET is_default = TRUE
            WHERE id = (SELECT id FROM coexistence.whatsapp_accounts ORDER BY id ASC LIMIT 1)`
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[whatsapp-accounts] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete WhatsApp Business account' });
  }
});

// Normalise phone numbers for matching: strip everything but digits.
function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

function rowToCreds(r) {
  if (!r) return null;
  return {
    id: r.id,
    displayName: r.display_name,
    displayPhoneNumber: r.display_phone_number,
    phoneNumberId: r.phone_number_id,
    wabaId: r.waba_id,
    accessToken: decrypt(r.access_token_encrypted),
    isActive: r.is_active,
  };
}

async function getAccountWithToken(accountId) {
  const { rows } = await pool.query(
    'SELECT * FROM coexistence.whatsapp_accounts WHERE id = $1',
    [accountId]
  );
  return rowToCreds(rows[0]);
}

/**
 * Return the connected account ONLY when exactly one exists. Used as a fallback
 * when phone-number matching can't resolve an account — e.g. the display number
 * hasn't been derived from Meta yet. With several numbers connected it returns
 * null on purpose: guessing could send a message from the wrong number.
 */
async function getSingleAccount() {
  const { rows } = await pool.query(
    'SELECT * FROM coexistence.whatsapp_accounts ORDER BY is_default DESC, id ASC LIMIT 2'
  );
  if (rows.length !== 1) return null;
  return rowToCreds(rows[0]);
}

/**
 * Resolve the WhatsApp account that owns the given phone number. Used by
 * broadcasts and automation message nodes to derive credentials from a
 * "from" phone number. Matches by digits-only normalisation so users can
 * register the number as "+919342245724" or "919342245724".
 */
async function getAccountByPhoneNumber(phoneOrId) {
  const norm = normalizePhone(phoneOrId);
  if (!norm) return null;
  const { rows } = await pool.query(
    `SELECT * FROM coexistence.whatsapp_accounts
       WHERE regexp_replace(display_phone_number, '\\D', '', 'g') = $1
          OR phone_number_id = $2
       LIMIT 1`,
    [norm, String(phoneOrId)]
  );
  return rowToCreds(rows[0]);
}

module.exports = { router, getAccountWithToken, getAccountByPhoneNumber, getSingleAccount };
