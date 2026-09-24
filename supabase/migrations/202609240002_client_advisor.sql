-- Pola pisemnego doradcy klienta. Migracja jest idempotentna i nie nadpisuje danych.
begin;

alter table public.clients add column if not exists current_complaints text;
alter table public.clients add column if not exists work_context text;
alter table public.clients add column if not exists wellbeing_context text;
alter table public.clients add column if not exists relationship_context text;
alter table public.clients add column if not exists conversation_followups text;
alter table public.clients add column if not exists avoid_topics text;
alter table public.clients add column if not exists briefing_json jsonb;
alter table public.clients add column if not exists briefing_generated_at timestamptz;

comment on column public.clients.current_complaints is
  'Aktualne dolegliwości i zmiany zgłaszane przez klienta; bez diagnozy.';
comment on column public.clients.work_context is
  'Charakter pracy, pozycja i powtarzalne obciążenia klienta.';
comment on column public.clients.wellbeing_context is
  'Sen, stres i samopoczucie opisane przez klienta; bez rozpoznania psychologicznego.';
comment on column public.clients.relationship_context is
  'Taktowne informacje relacyjne pomocne w budowaniu ciągłości obsługi klienta.';
comment on column public.clients.conversation_followups is
  'Tematy, do których można naturalnie wrócić podczas kolejnej wizyty.';
comment on column public.clients.avoid_topics is
  'Tematy, których terapeutka nie powinna samodzielnie poruszać.';
comment on column public.clients.briefing_json is
  'Ostatnia wygenerowana odprawa AI; nie jest źródłem danych medycznych.';

commit;

