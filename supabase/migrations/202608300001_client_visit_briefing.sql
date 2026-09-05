-- Rozszerzenie karty klienta: pamięć relacyjna i bezpieczna odprawa przed wizytą.
-- Migracja nie usuwa ani nie nadpisuje dotychczasowych danych.
begin;

alter table public.clients add column if not exists relationship_context text;
alter table public.clients add column if not exists conversation_followups text;
alter table public.clients add column if not exists avoid_topics text;
alter table public.clients add column if not exists briefing_json jsonb;
alter table public.clients add column if not exists briefing_generated_at timestamptz;

comment on column public.clients.relationship_context is
  'Taktowne informacje relacyjne pomocne w budowaniu ciągłości obsługi klienta.';
comment on column public.clients.conversation_followups is
  'Tematy, do których można naturalnie wrócić podczas kolejnej wizyty.';
comment on column public.clients.avoid_topics is
  'Tematy, których terapeutka nie powinna samodzielnie poruszać.';
comment on column public.clients.briefing_json is
  'Ostatnia wygenerowana odprawa przed wizytą; nie jest źródłem danych medycznych.';

-- Dostęp pozostaje ograniczony przez istniejącą politykę clients_admin_all.
revoke all on public.clients from anon;
grant select, insert, update, delete on public.clients to authenticated;

commit;
