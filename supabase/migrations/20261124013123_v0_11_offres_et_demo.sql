-- VALTIQ v0.11 : suivi des offres commerciales et espaces de démonstration.
-- Colonnes facultatives uniquement : aucune donnée existante n'est modifiée, aucune fonction Make n'est touchée.

-- Espace de démonstration : données fictives, signalées dans toute l'interface
alter table public.organizations
  add column if not exists is_demo boolean not null default false;

-- Taille de l'entreprise (nombre de salariés)
alter table public.companies
  add column if not exists size text
    check (size is null or size in ('1-9', '10-49', '50-249', '250+'));

-- Offre présentée, date de présentation et raison d'achat (la raison de refus utilise lost_reason, déjà présent)
alter table public.opportunities
  add column if not exists offer text check (offer is null or char_length(offer) <= 120),
  add column if not exists presented_at date,
  add column if not exists win_reason text check (win_reason is null or char_length(win_reason) <= 200);

alter table public.opportunities
  add constraint opportunities_lost_reason_length check (lost_reason is null or char_length(lost_reason) <= 200);