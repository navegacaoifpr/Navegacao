// Funções compartilhadas pelas telas do administrador
// (projetos, login, ambientes e o editor de grafo).

const API = window.location.origin;;

function getSession(){
  try{
    return JSON.parse(localStorage.getItem("session")) || null;
  }catch{
    return null;
  }
}

function saveSession(project, token){
  localStorage.setItem("session", JSON.stringify({
    projectId: project.id,
    projectName: project.name,
    token
  }));
  // mantido por compatibilidade com telas antigas
  localStorage.setItem("isAdmin", "true");
}

function logout(){
  localStorage.removeItem("session");
  localStorage.removeItem("isAdmin");

  // encerra também o login da conta (o Supabase guarda a sessão em "sb-...-auth-token")
  try{
    Object.keys(localStorage)
      .filter(k => k.startsWith("sb-") && k.endsWith("-auth-token"))
      .forEach(k => localStorage.removeItem(k));
  }catch{}

  window.location.href = "projetos.html";
}

// manda pra tela de projetos se não tiver ninguém logado
function requireSession(){
  const session = getSession();

  if(!session){
    window.location.href = "projetos.html";
    return null;
  }

  return session;
}

function getQueryParam(name){
  return new URLSearchParams(window.location.search).get(name);
}

function imageUrl(filename, thumb = true){
  if(!filename) return null;
  return `${API}/images/${thumb ? "thumbs/" : ""}${encodeURIComponent(filename)}`;
}

// lê a mensagem de erro que a API devolve (FastAPI usa "detail")
async function readError(res, fallback){
  const data = await res.json().catch(() => ({}));
  return data.detail || fallback;
}

function escapeHtml(text){
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// aviso rápido das telas de projetos/ambientes (o editor tem o próprio showToast)
function painelToast(message, type = "success"){
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : ""}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
