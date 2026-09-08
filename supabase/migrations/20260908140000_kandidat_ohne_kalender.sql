-- Ein recherchierter Kandidat darf keinen Terminlink haben.
--
-- `20260825120000_sourced_candidates.sql` hat die Pflichtfelder für die Quelle
-- `web_research` gelockert — Einwilligung, Adresse, Sprachen, Skills — und
-- `booking_url` dabei übersehen. Die Spalte ist weiterhin NOT NULL.
--
-- Die Folge war unsichtbar und vollständig: `sourcedCandidateInsert()` setzt
-- `booking_url: null`, weil eine recherchierte Person keinen öffentlichen
-- Kalender hat und einer nicht erfunden werden darf. Jede Übernahme scheiterte
-- deshalb mit 23502, die Anwendung meldete das pauschal als `rejected`, und
-- niemand sah nach. Am 8. September 2026 lagen acht bezahlte Suchläufe mit
-- dreizehn gefundenen Menschen vor — und null Kandidaten.
--
-- Der Kalender ist genau das, was die Person selbst beiträgt, wenn sie
-- zustimmt. Vorher kann er nicht dastehen.

begin;

alter table public.freelancer_applications
  alter column booking_url drop not null;

-- Die Formprüfung galt bisher bedingungslos und hätte NULL auch dann
-- abgewiesen, wenn die Spalte es erlaubt.
alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_booking_url_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_booking_url_check
  check (
    booking_url is null
    or (
      booking_url ~ '^https://'
      and char_length(booking_url) between 12 and 1000
    )
  );

-- Was die Lockerung nicht aufweichen darf: Ein sichtbares Profil ist buchbar.
-- Ohne diese Regel wanderte ein Kandidat ohne Kalender bis in die Freigabe.
alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_booking_required_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_booking_required_check
  check (status = 'sourced' or booking_url is not null);

comment on column public.freelancer_applications.booking_url is
  'Der öffentliche Terminlink. Leer bei recherchierten Kandidaten — den trägt '
  'die Person selbst ein, wenn sie zustimmt. Ab dem Zustand submitted Pflicht.';

-- Nachtrag, zwei Minuten später gefunden: dieselbe Lücke ein zweites Mal.
--
-- `freelancer_applications_decision_check` verlangt für jeden Zustand außer
-- `submitted` und `in_review` einen Prüfvermerk — `reviewed_at` und
-- `reviewed_by_user_id`. Der Zustand `sourced` kam erst im August dazu und
-- wurde hier nicht nachgetragen. Ein frisch recherchierter Kandidat hat aber
-- keine Prüfentscheidung: Es hat ihn noch niemand angesehen, das ist gerade
-- sein Wesen.
--
-- Zusammen mit der NOT-NULL-Spalte oben ergibt das den vollständigen Grund,
-- warum seit sechs Wochen kein einziger Kandidat entstanden ist.

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_decision_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_decision_check
  check (
    status in ('sourced', 'submitted', 'in_review')
    or (reviewed_at is not null and reviewed_by_user_id is not null)
  );

commit;
