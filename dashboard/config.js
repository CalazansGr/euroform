// Preencha com os dados do projeto Supabase (Project Settings > API).
// A chave anon/publishable é pública por design; a proteção real está no login + RLS do banco.
window.EUROFORM_CONFIG = {
  SUPABASE_URL: "https://qiopintwzywhjoomvcic.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_VFZ1bl5tRMW5ytfkjkENqw_Xg8QnX1u",
  // Alíquota efetiva do Simples (confira com o contador; ela muda conforme o faturamento dos últimos 12 meses)
  ALIQUOTA_VENDA: 0.0716,    // venda de cadeiras (7,16%)
  ALIQUOTA_SERVICO: 0.1052,  // higienização, manutenção, revestimento (10,52%)
  DIA_VENCIMENTO_SIMPLES: 20 // dia do mês em que o Simples (sobre a NF do mês anterior) vence
};
