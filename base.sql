-- 1) Control de correlativo (1 fila)
create table if not exists material_counter (
  id              int primary key default 1,
  last_matnr18    numeric(18,0) not null
);

insert into material_counter (id, last_matnr18)
values (1, 0)
on conflict (id) do nothing;

-- 2) Cabecera de lote
create table if not exists alta_lotes (
  lote_id           text primary key,
  comprador         text,
  grupo_compra      text not null,
  are               text,
  meins             text,
  tipo_ean          text,
  pais              text,
  clasif_fiscal_q   text,
  created_at        timestamptz not null default now(),

  -- rango asignado
  matnr_from18      numeric(18,0) not null,
  matnr_to18        numeric(18,0) not null,

  items_count       int not null,
  status            text not null default 'CONFIRMED'  -- o 'RESERVED' si querés 2 pasos
);

-- 3) Detalle ALTA (equivalente a tu “primer TXT”)
create table if not exists alta_items (
  id              bigserial primary key,
  lote_id         text not null references alta_lotes(lote_id) on delete cascade,
  matnr18         numeric(18,0) not null,

  mtart           text not null,         -- "HAWA"
  matkl           text not null,
  are             text,
  maktx           text not null,
  meins           text,
  ean11           text,
  eantp           text,
  taxm1           text,                  -- tu fiscal 1/2 + mapping ivaCode si querés guardar ambos
  bklas           text,                  -- 3100/3101
  herkl           text,                  -- PY
  raube           text,                  -- almacén
  tempb           text,                  -- temp
  ekgrp_p         text,                  -- grupo compra P
  q_const         text,                  -- constQ
  grupo_carga_r   text,
  factor_s        numeric,
  marca_t         text,
  art_ant_u       text,
  drogas_txt      text,
  droga_cod       text,
  fabricante_lbl  text,
  fabricante_y    text,
  planta          text,
  atinn_1         text,
  atwrt_1         text,
  tipo_origen     text,                  -- NAC/IMP/MIX
  brt_net         text,
  texto_breve     text,

  unique(lote_id, matnr18)
);

-- 4) REG (15 cols)
create table if not exists reg_items (
  id         bigserial primary key,
  lote_id    text not null references alta_lotes(lote_id) on delete cascade,
  matnr_ext  text not null,          -- sin ceros
  lifnr      text not null,
  ekorg      text not null,
  esokz      text not null,
  relif      text not null,
  aplfz      text not null,
  ekgrp      text not null,
  normb      text not null,
  bstae      text not null,
  mwskz      text not null,
  netpr      numeric not null,
  waers      text not null,
  peinh      text not null,
  bprme      text not null,
  bpumn      text not null
);

-- 5) DESC opcional
create table if not exists desc_items (
  id         bigserial primary key,
  lote_id    text not null references alta_lotes(lote_id) on delete cascade,
  matnr_ext  text not null,
  lifnr      text not null,
  ekorg      text not null,
  desde      text not null,   -- ddmmyyyy
  descuento  int not null
);
