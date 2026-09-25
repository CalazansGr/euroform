-- Atualização do banco (set/2026): situação do serviço, emissão da NF e data do recebimento.
-- Rode UMA vez no Supabase: SQL Editor > New query > colar tudo > Run. Pode rodar de novo sem problema.

-- Serviço pendente (a fazer) ou realizado. Os que já existem ficam como realizados.
alter table servicos add column if not exists status text not null default 'realizado';
alter table servicos drop constraint if exists servicos_status_check;
alter table servicos add constraint servicos_status_check check (status in ('pendente','realizado'));

-- Data de emissão da NF. Vazia = "NF ainda não emitida" (o Simples só é agendado depois de emitir).
alter table servicos add column if not exists nf_emitida_em date;
-- As OS com NF que já existem continuam como antes (NF considerada emitida na data do serviço).
update servicos set nf_emitida_em = data_servico where com_nf and nf_emitida_em is null;

-- Dia em que o cliente realmente pagou cada parcela.
alter table recebimentos add column if not exists pago_em date;
