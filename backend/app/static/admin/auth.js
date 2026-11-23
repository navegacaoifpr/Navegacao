// Funções de login compartilhadas (usa o Supabase).
// Carregue DEPOIS de: supabase-js (CDN), supabase-config.js e sessao.js.

const supabaseReady = !SUPABASE_URL.includes("COLE_AQUI") && !SUPABASE_ANON_KEY.includes("COLE_AQUI");

const sb = supabaseReady
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// token do usuário logado (o Supabase renova sozinho quando precisa)
async function getAccessToken(){
  if(!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.access_token : null;
}

async function getAccountUser(){
  if(!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}

// endereço de uma página irmã desta (ex.: "redefinir.html")
function pageUrl(name){
  return new URL(name, window.location.href).href;
}

// só deixa voltar para páginas do próprio site (evita redirecionar pra fora)
function safeNext(value, fallback){
  return /^[A-Za-z0-9_\-]+\.html(\?[A-Za-z0-9_=&\-]*)?$/.test(value || "") ? value : fallback;
}

// traduz as mensagens de erro do Supabase
function authError(err){
  const msg = String((err && err.message) || err || "");

  if(/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if(/email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).";
  if(/already registered|already been registered/i.test(msg)) return "Já existe uma conta com esse e-mail.";
  if(/password should be|at least \d+ characters/i.test(msg)) return "A senha é curta ou fraca demais. Use 8 ou mais caracteres, com letras e números.";
  if(/rate limit|too many/i.test(msg)) return "Muitas tentativas ou e-mails em pouco tempo. Espere alguns minutos e tente de novo.";
  if(/same password|different from the old/i.test(msg)) return "A nova senha precisa ser diferente da atual.";
  if(/failed to fetch|network/i.test(msg)) return "Não foi possível conectar ao serviço de login. Confira a internet.";

  return msg || "Algo deu errado. Tente de novo.";
}

function configMissingMessage(){
  return "O login ainda não foi configurado: preencha a URL e a chave do Supabase em supabase-config.js.";
}
