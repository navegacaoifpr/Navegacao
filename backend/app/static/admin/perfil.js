// Perfil da conta no canto superior das telas do administrador.
//
// Mostra com qual e-mail você está conectada e abre um menu com
// "Minha conta", "Projetos" e "Sair da conta". Sem conta conectada, mostra "Entrar".
// Carregue DEPOIS do sessao.js. Não precisa do Supabase carregado para mostrar
// o e-mail (lê da sessão guardada no navegador); se o auth.js estiver na página,
// o "Sair" também encerra a sessão no servidor.

(function(){

function storedUser(){
  try{
    const key = Object.keys(localStorage).find(k => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if(!key) return null;

    const data = JSON.parse(localStorage.getItem(key));
    return (data && (data.user || (data.currentSession && data.currentSession.user))) || null;
  }catch{
    return null;
  }
}

async function signOutEverywhere(){
  try{
    if(typeof sb !== "undefined" && sb) await sb.auth.signOut();
  }catch{}

  localStorage.removeItem("session");
  localStorage.removeItem("isAdmin");

  try{
    Object.keys(localStorage)
      .filter(k => k.startsWith("sb-") && k.endsWith("-auth-token"))
      .forEach(k => localStorage.removeItem(k));
  }catch{}

  window.location.href = "projetos.html";
}

const header = document.querySelector(".painel-header") || document.querySelector("header");
if(!header) return;

const user = storedUser();
const box = document.createElement("div");
box.className = "perfil-box";

if(!user || !user.email){
  // sem conta conectada
  const next = window.location.pathname.split("/").pop() + window.location.search;
  box.innerHTML = `<a class="perfil-chip perfil-entrar" href="acesso.html?next=${encodeURIComponent(next)}">
    <i class="bi bi-person-circle"></i><span>Entrar</span></a>`;
}else{
  const initial = user.email.trim().charAt(0).toUpperCase() || "?";

  box.innerHTML = `
    <button type="button" class="perfil-chip" aria-haspopup="menu" aria-expanded="false" title="Sua conta">
      <span class="perfil-avatar"></span>
      <span class="perfil-email"></span>
      <i class="bi bi-chevron-down"></i>
    </button>
    <div class="perfil-menu" role="menu" hidden>
      <div class="perfil-menu-head">
        <span class="perfil-avatar big"></span>
        <div>
          <small>Conta conectada</small>
          <b class="perfil-menu-email"></b>
        </div>
      </div>
      <a href="conta.html" role="menuitem"><i class="bi bi-person-gear"></i> Minha conta</a>
      <a href="projetos.html" role="menuitem"><i class="bi bi-grid"></i> Projetos</a>
      <button type="button" class="perfil-sair" role="menuitem"><i class="bi bi-box-arrow-right"></i> Sair da conta</button>
    </div>`;

  // textContent: o e-mail nunca é tratado como HTML
  box.querySelectorAll(".perfil-avatar").forEach(el => el.textContent = initial);
  box.querySelector(".perfil-email").textContent = user.email;
  box.querySelector(".perfil-menu-email").textContent = user.email;

  const chip = box.querySelector(".perfil-chip");
  const menu = box.querySelector(".perfil-menu");

  function setOpen(open){
    menu.hidden = !open;
    chip.setAttribute("aria-expanded", String(open));
  }

  chip.addEventListener("click", e => {
    e.stopPropagation();
    setOpen(menu.hidden);
  });

  menu.addEventListener("click", e => e.stopPropagation());
  document.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", e => { if(e.key === "Escape") setOpen(false); });

  box.querySelector(".perfil-sair").addEventListener("click", signOutEverywhere);
}

// o botão "Sair" antigo (ambientes) vira desnecessário: o menu do perfil já tem
const oldLogout = document.getElementById("logout-btn");
if(oldLogout) oldLogout.style.display = "none";

const spacer = header.querySelector(".header-spacer");

if(spacer) spacer.replaceWith(box);
else header.appendChild(box);

})();
