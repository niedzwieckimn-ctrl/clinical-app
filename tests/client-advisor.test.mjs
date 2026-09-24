import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  advisorInstructions,
  answerSchema,
  briefingSchema,
  buildClientSource,
  buildOpenAIRequest,
  compactBookings,
  generalIdeaSchema,
  normalizeConversation,
  redactContact,
  redactSelectedClient,
  redactSelectedClientFromJson,
  sanitizeJson,
} from '../netlify/functions/_client-advisor.js';

test('usuwa e-mail, telefon i długi numer z danych wysyłanych do modelu', () => {
  const result = redactContact('Anna anna@example.com tel. +48 600 700 800, PESEL 90010112345');
  assert.equal(result.includes('anna@example.com'), false);
  assert.equal(result.includes('600 700 800'), false);
  assert.equal(result.includes('90010112345'), false);
  assert.match(result, /e-mail usunięty/);
  assert.match(result, /telefon usunięty|numer identyfikacyjny usunięty/);
});

test('historia pomija anulowane wizyty i oddziela przyszłe od poprzednich', () => {
  const now = new Date('2026-09-24T10:00:00Z');
  const result = compactBookings([
    { booking_no: '1', when: '2026-09-20T10:00:00Z', status: 'Potwierdzona', service_name: 'Masaż A' },
    { booking_no: '2', when: '2026-09-26T10:00:00Z', status: 'Oczekująca', service_name: 'Masaż B' },
    { booking_no: '3', when: '2026-09-27T10:00:00Z', status: 'Anulowana', service_name: 'Masaż C' },
  ], now);
  assert.deepEqual(result.history.map((item) => item.date), ['2026-09-20T10:00:00Z']);
  assert.deepEqual(result.upcoming.map((item) => item.date), ['2026-09-26T10:00:00Z']);
  assert.equal(JSON.stringify(result).includes('booking_ref'), false);
});

test('rozmowa dopuszcza tylko role user i assistant oraz ostatnie osiem wpisów', () => {
  const input = [
    { role: 'system', content: 'nie wolno' },
    ...Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `wpis ${index}` })),
  ];
  const result = normalizeConversation(input);
  assert.equal(result.length, 8);
  assert.equal(result.some((item) => item.role === 'system'), false);
  assert.equal(result[0].content, 'wpis 2');
});

test('schematy strict wymagają każdego zdefiniowanego pola', () => {
  for (const schema of [briefingSchema, answerSchema, generalIdeaSchema]) {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
  }
});

test('imię i nazwisko otwartego klienta nie trafiają do pytania ani odpowiedzi', () => {
  const question = redactSelectedClient('Powiedz mi coś o Marcinie Niedźwieckim', 'Marcin Niedźwiecki');
  assert.equal(question.includes('Marcin'), false);
  assert.equal(question.includes('Niedźwiecki'), false);
  const output = redactSelectedClientFromJson({ answer: 'Marcin Niedźwiecki lubi mocny nacisk.' }, 'Marcin Niedźwiecki');
  assert.equal(output.answer.includes('Marcin'), false);
  assert.equal(output.answer.includes('Niedźwiecki'), false);
  assert.match(output.answer, /ten klient/i);
});

test('tryb Pomysły SPA nie zawiera danych klienta i przygotowuje treść do ręcznego zapisu', () => {
  const request = buildOpenAIRequest({
    mode: 'general',
    source: { private: 'DANE KLIENTA' },
    question: 'Daj pomysł na wodę różaną.',
    conversation: [],
    model: 'test-model',
    safetyIdentifier: 'abc123',
  });
  assert.equal(request.input.includes('DANE KLIENTA'), false);
  assert.equal(request.store, false);
  assert.equal(request.text.format.name, 'spa_idea_answer');
  assert.equal(request.text.format.schema.properties.idea_content.type, 'string');
});

test('tryb czatu korzysta ze Structured Outputs i nie zapisuje odpowiedzi po stronie OpenAI', () => {
  const request = buildOpenAIRequest({
    mode: 'chat',
    source: sanitizeJson({ notes: 'Kontakt: test@example.com, +48 600 700 800' }),
    question: 'Na co uważać?',
    conversation: [{ role: 'user', content: 'Co ostatnio?' }],
    model: 'test-model',
    safetyIdentifier: 'abc123',
  });
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.name, 'client_advisor_answer');
  assert.equal(request.input.includes('test@example.com'), false);
  assert.equal(request.input.includes('600 700 800'), false);
});

test('pakiet klienta nie przekazuje modelowi imienia, adresu ani danych kontaktowych', () => {
  const source = buildClientSource({
    client: {
      name: 'Jan Tajny',
      address: 'Sekretna 12',
      email: 'jan@example.com',
      phone: '+48 600 700 800',
      current_complaints: 'Napięcie karku',
      work_context: 'Praca przy komputerze',
      treatment_notes: { '2026-09-20': 'Jan dobrze tolerował delikatny nacisk' },
    },
    rows: [],
    services: [{ name: 'Masaż relaksacyjny' }],
    now: new Date('2026-09-24T10:00:00Z'),
  });
  const json = JSON.stringify(source);
  assert.equal(json.includes('Jan Tajny'), false);
  assert.equal(json.includes('Jan dobrze'), false);
  assert.equal(json.includes('Sekretna 12'), false);
  assert.equal(json.includes('jan@example.com'), false);
  assert.equal(json.includes('600 700 800'), false);
  assert.match(json, /Napięcie karku/);
  assert.match(json, /Praca przy komputerze/);
});

test('instrukcje blokują diagnozowanie i nakazują ostrożność przy czerwonych flagach', () => {
  assert.match(advisorInstructions, /Nie stawiaj diagnoz/i);
  assert.match(advisorInstructions, /wstrzymanie zabiegu/i);
  assert.match(advisorInstructions, /nie zastępuje/i);
});

test('funkcja doradcy nie ma żadnej operacji zapisu do Supabase', () => {
  const source = readFileSync(new URL('../netlify/functions/client-advisor.js', import.meta.url), 'utf8');
  assert.equal(/\.update\s*\(/.test(source), false);
  assert.equal(/\.insert\s*\(/.test(source), false);
  assert.equal(/\.delete\s*\(/.test(source), false);
});
