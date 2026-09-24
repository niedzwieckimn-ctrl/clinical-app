import { requireAdmin, response } from './_auth.js';
import {
  buildOpenAIRequest,
  buildClientSource,
  clipText,
  extractOutputText,
  makeSafetyIdentifier,
  redactSelectedClient,
  redactSelectedClientFromJson,
} from './_client-advisor.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const CLIENT_FIELDS = [
  'id', 'name', 'email', 'phone', 'prefs', 'allergies', 'contras', 'notes', 'treatment_notes',
  'current_complaints', 'work_context', 'wellbeing_context',
  'relationship_context', 'conversation_followups', 'avoid_topics',
].join(',');

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

function withCors(result) {
  return { ...result, headers: { ...(result.headers || {}), ...CORS } };
}

async function fetchBookingRows(sb, client) {
  const byKey = new Map();
  const searches = [];
  if (client.email) {
    searches.push(
      sb.from('bookings_view').select('*').ilike('client_email', String(client.email).trim()).order('when', { ascending: false }).limit(40)
    );
  }
  if (client.phone) {
    searches.push(
      sb.from('bookings_view').select('*').eq('phone', String(client.phone).trim()).order('when', { ascending: false }).limit(40)
    );
  }
  if (!searches.length) return [];
  const results = await Promise.all(searches);
  for (const result of results) {
    if (result.error) throw new Error(`Nie udało się pobrać historii: ${result.error.message}`);
    for (const row of result.data || []) {
      const key = row.booking_id || row.booking_no || row.id || `${row.when}|${row.service_name}`;
      byKey.set(String(key), row);
    }
  }
  return [...byKey.values()];
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST') return withCors(response(405, { error: 'Method Not Allowed' }));

  try {
    const auth = await requireAdmin(event);
    if (auth.error) return withCors(auth.error);
    if (!process.env.OPENAI_API_KEY) {
      return withCors(response(503, { error: 'Brak OPENAI_API_KEY w zmiennych Netlify.' }));
    }

    const body = JSON.parse(event.body || '{}');
    const clientId = String(body.client_id || '').trim();
    const mode = body.mode === 'general' ? 'general' : (body.mode === 'chat' ? 'chat' : 'briefing');
    if (!isUuid(clientId)) return withCors(response(400, { error: 'Nieprawidłowy client_id.' }));
    if ((mode === 'chat' || mode === 'general') && !clipText(body.question, 2000)) {
      return withCors(response(400, { error: 'Wpisz pytanie do doradcy.' }));
    }

    const { data: client, error: clientError } = await auth.sb
      .from('clients')
      .select(mode === 'general' ? 'id,name' : CLIENT_FIELDS)
      .eq('id', clientId)
      .single();
    if (clientError || !client) return withCors(response(404, { error: 'Nie znaleziono klienta lub nie wykonano migracji odprawy.' }));

    let source = {};
    if (mode !== 'general') {
      const rows = await fetchBookingRows(auth.sb, client);
      const { data: services, error: servicesError } = await auth.sb
        .from('services')
        .select('name')
        .eq('active', true)
        .order('name');
      if (servicesError) console.warn('[client-advisor] services', servicesError.message);
      source = buildClientSource({ client, rows, services: services || [] });
    }
    const question = redactSelectedClient(body.question, client.name);
    const conversation = Array.isArray(body.conversation)
      ? body.conversation.map((item) => ({ ...item, content: redactSelectedClient(item?.content, client.name) }))
      : [];

    const model = process.env.OPENAI_ADVISOR_MODEL || process.env.OPENAI_BRIEFING_MODEL || 'gpt-5.4-mini';
    const requestBody = buildOpenAIRequest({
      mode,
      source,
      question,
      conversation,
      model,
      safetyIdentifier: makeSafetyIdentifier(auth.user.id),
    });
    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const payload = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) {
      console.error('[client-advisor] OpenAI', openaiResponse.status, payload?.error?.code || 'unknown');
      return withCors(response(502, { error: 'Doradca nie odpowiedział. Spróbuj ponownie za chwilę.' }));
    }

    const outputText = extractOutputText(payload);
    if (!outputText) return withCors(response(502, { error: 'Model nie zwrócił odpowiedzi.' }));
    let result;
    try {
      result = redactSelectedClientFromJson(JSON.parse(outputText), client.name);
    } catch {
      return withCors(response(502, { error: 'Model zwrócił odpowiedź w nieprawidłowym formacie.' }));
    }

    if (mode === 'briefing') {
      const generatedAt = new Date().toISOString();
      return withCors(response(200, { mode, briefing: result, generated_at: generatedAt }));
    }

    return withCors(response(200, { mode, answer: result }));
  } catch (error) {
    console.error('[client-advisor]', error);
    return withCors(response(500, { error: 'Nie udało się uruchomić doradcy klienta.' }));
  }
};
