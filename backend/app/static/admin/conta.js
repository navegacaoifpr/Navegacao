const okEl = document.getElementById("conta-ok");
const errorEl = document.getElementById("conta-error");

function showError(message){
  okEl.classList.add("hidden");
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function showOk(message){
  errorEl.classList.add("hidden");
  okEl.textContent = message;
  okEl.classList.remove("hidden");
}

/* =========================
   PERFIL
========================= */

async function loadAccount(){
  if(!sb){
    showError(configMissingMessage());
    return;
  }

  const user = await getAccountUser();

  // sem conta conectada: vai entrar e volta pra cá
  if(!user){
    window.location.href = "acesso.html?next=conta.html";
    return;
  }

  document.getElementById("conta-email").textContent = user.email || "";
  document.getElementById("conta-avatar").textContent = (user.email || "?").trim().charAt(0).toUpperCase();
  document.getElementById("email").value = user.email || "";

  if(user.created_at){
    const date = new Date(user.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    document.getElementById("conta-desde").textContent = `Conta criada em ${date}`;
  }

  loadMyProjects();
}

document.getElementById("conta-logout").addEventListener("click", async () => {
  try{ if(sb) await sb.auth.signOut(); }catch{}
  logout();
});

/* =========================
   MEUS PROJETOS
========================= */

async function loadMyProjects(){
  const grid = document.getElementById("my-projects");
  const token = await getAccessToken();

  try{
    const res = await fetch(`${API}/projects/mine`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if(!res.ok){
      throw new Error(await readError(res, "Não deu pra carregar os seus projetos."));
    }

    const projects = await res.json();

    if(projects.length === 0){
      grid.innerHTML = `<div class="conta-vazio">
        Esta conta ainda não tem projetos.<br>
        Crie um na tela de <a href="projetos.html">Projetos</a>, ou, se já existe um projeto antigo seu, entre nele para ligá-lo a esta conta.
      </div>`;
      return;
    }

    grid.innerHTML = "";
    projects.forEach(p => grid.appendChild(buildProjectCard(p)));
  }catch(err){
    const msg = err instanceof TypeError
      ? "Não foi possível conectar ao servidor. O backend está rodando?"
      : err.message;

    grid.innerHTML = `<p class="empty-state">${escapeHtml(msg)}</p>`;
  }
}

function buildProjectCard(project){
  const slot = document.createElement("div");
  slot.className = "card-slot";

  slot.innerHTML = `
    <div class="card">
      ${cardImageHtml(imageUrl(project.cover_image), project.name)}
      <div class="card-body">
        <i class="bi bi-building"></i>
        <span class="card-title">${escapeHtml(project.name)}</span>
        <span class="badge-dono">Seu projeto</span>
      </div>
      ${project.description ? `<div class="card-info">${escapeHtml(project.description)}</div>` : ""}
    </div>
  `;

  // entrar num projeto sempre pede o e-mail e a senha de novo
  slot.querySelector(".card").addEventListener("click", () => {
    window.location.href = `login.html?project=${project.id}`;
  });

  return slot;
}

/* =========================
   TROCAR E-MAIL E SENHA
========================= */

document.getElementById("email-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const submit = document.getElementById("email-submit");
  submit.disabled = true;

  try{
    const { error } = await sb.auth.updateUser(
      { email },
      { emailRedirectTo: pageUrl("conta.html") }
    );

    if(error){
      showError(authError(error));
      return;
    }

    showOk("Pronto! Enviamos um link de confirmação. O e-mail só muda depois que você abrir o link.");
  }catch(err){
    showError(authError(err));
  }finally{
    submit.disabled = false;
  }
});

document.getElementById("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const password = document.getElementById("new-password").value;

  if(password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)){
    showError("A senha precisa ter 8 ou mais caracteres, com letras e números.");
    return;
  }

  if(password !== document.getElementById("new-password2").value){
    showError("As senhas novas não são iguais.");
    return;
  }

  const submit = document.getElementById("password-submit");
  submit.disabled = true;

  try{
    const { error } = await sb.auth.updateUser({ password });

    if(error){
      showError(authError(error));
      return;
    }

    document.getElementById("new-password").value = "";
    document.getElementById("new-password2").value = "";
    showOk("Senha alterada!");
  }catch(err){
    showError(authError(err));
  }finally{
    submit.disabled = false;
  }
});

loadAccount();
