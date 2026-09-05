alter table public.bookings
  add column if not exists reminder_email_ids jsonb not null default '[]'::jsonb,
  add column if not exists reminder_scheduled_at timestamptz;

comment on column public.bookings.reminder_email_ids is
  'Identyfikatory zaplanowanych wiadomości Resend, używane do anulowania przypomnień.';

comment on column public.bookings.reminder_scheduled_at is
  'Termin wysyłki przypomnienia ustawiony w Resend.';
