-- Rode no Supabase: SQL Editor > New query > colar > Run.
create table clientes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('PF','PJ')),
  nome text not null,
  documento text,
  criado_em timestamptz not null default now()
);

create table servicos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id),
  categoria text not null check (categoria in ('higienizacao','manutencao','venda','revestimento')),
  data_servico date not null default current_date,
  detalhes jsonb not null default '{}',        -- campos dinâmicos (modelo, qtd, insumos, estofador...)
  com_nf boolean not null default false,
  valor_nf numeric(12,2),
  valor_bruto numeric(12,2) not null default 0,
  custo_total numeric(12,2) not null default 0,
  imposto numeric(12,2) not null default 0,
  condicao_pagamento text,                     -- 'avista','30','30/60'...
  observacoes text,
  status text not null default 'realizado' check (status in ('pendente','realizado')),
  nf_emitida_em date,                          -- vazio = NF ainda não emitida
  criado_em timestamptz not null default now()
);

create table recebimentos (
  id uuid primary key default gen_random_uuid(),
  servico_id uuid not null references servicos(id) on delete cascade,
  vencimento date not null,
  valor numeric(12,2) not null,
  pago boolean not null default false,
  pago_em date                                 -- dia em que o cliente pagou
);

create table despesas (
  id uuid primary key default gen_random_uuid(),
  servico_id uuid references servicos(id) on delete set null,
  tipo text not null check (tipo in ('variavel','recorrente','imposto')),
  descricao text not null,
  fornecedor text,
  valor numeric(12,2) not null,
  vencimento date not null,
  pago boolean not null default false,
  recorrente_id uuid
);

create table recorrentes (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  valor numeric(12,2) not null,
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  ativo boolean not null default true
);

-- Segurança: só usuários logados acessam qualquer coisa.
do $$
declare t text;
begin
  foreach t in array array['clientes','servicos','recebimentos','despesas','recorrentes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "autenticados" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Configurações simples (ex.: saldo em caixa) compartilhadas entre os usuários.
create table if not exists configuracoes (
  chave text primary key,
  valor jsonb
);
alter table configuracoes enable row level security;
create policy "autenticados" on configuracoes for all to authenticated using (true) with check (true);
