// Projeto Supabase (Project Settings > API).
// A chave publishable é pública por design; a proteção real é o login + as regras de acesso (RLS) do banco.
window.EUROFORM_CONFIG = {
  SUPABASE_URL: 'https://qiopintwzywhjoomvcic.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_VFZ1bl5tRMW5ytfkjkENqw_Xg8QnX1u',
  // Alíquota estimada do Simples (só para a estimativa do painel; não entra em nenhuma conta).
  // Confira com o contador: ela muda conforme o faturamento dos últimos 12 meses.
  ALIQUOTA_VENDA: 0.0716,    // venda de cadeiras
  ALIQUOTA_SERVICO: 0.1052   // manutenção / reforma e higienização
};
