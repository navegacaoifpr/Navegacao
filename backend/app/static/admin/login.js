const projectId = Number(getQueryParam("project"));

// sem projeto escolhido: primeiro escolhe na tela de projetos
if(!projectId){
  window.location.href = "projetos.html";
}

const errorEl = document.getElementById("login-error");
const claimErrorEl = document.getElementById("claim-error");
const loginForm = document.getElementById("login-form");
const claimForm = document.getElementById("claim-form");

function showError(message){
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function showClaimError(message){
  claimErrorEl.textContent = message;
  claimErrorEl.classList.remove("hidden");
}

// o "criar conta" volta pra este login depois
document.getElementById("signup-link").href =
  `acesso.html?mode=signup&next=${encodeURIComponent("login.html?project=" + projectId)}`;

// mostra o nome do projeto no título
fetch(`${API}/projects/${projectId}`)
  .then(res => res.ok ? res.json() : null)
  .then(project => {
    if(!project){
      showError("Projeto não encontrado.");
      return;
    }
    document.getElementById("login-title").textContent = project.name;
    document.getElementById("login-subtitle").textContent = "Entre com o e-mail e a senha da conta dona deste projeto";
  })
  .catch(() => showError("Não foi possível conectar ao servidor. O backend está rodando?"));

// depois de digitar e-mail e senha, confere se a conta é a dona do projeto
async function checkAccess(email){
  const token = await getAccessToken();

  if(!token) return false;

  try{
    const res = await fetch(`${API}/projects/${projectId}/access`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if(res.ok){
      const data = await res.json();
      saveSession(data.project, token);
      window.location.href = "ambientes.html";
      return true;
    }

    if(res.status === 409){
      // projeto antigo, sem dono: pede o usuário/senha antigos uma vez
      document.getElementById("claim-email").textContent = email;
      loginForm.classList.add("hidden");
      claimForm.classList.remove("hidden");
      return false;
    }

    if(res.status === 403){
      showError(`A conta ${email} não é a dona deste projeto. Entre com o e-mail e a senha da conta dona, ou volte para os projetos.`);
      return false;
    }

    showError(await readError(res, "Não foi possível entrar nesse projeto."));
  }catch{
    showError("Não foi possível conectar ao servidor. O backend está rodando?");
  }

  return false;
}

if(!sb){
  showError(configMissingMessage());
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");

  if(!sb){
    showError(configMissingMessage());
    return;
  }

  const submit = document.getElementById("login-submit");
  submit.disabled = true;

  try{
    const email = document.getElementById("email").value.trim();

    const { error } = await sb.auth.signInWithPassword({
      email,
      password: document.getElementById("password").value
    });

    if(error){
      showError(authError(error));
      return;
    }

    document.getElementById("password").value = "";
    await checkAccess(email);

  }catch(err){
    showError(authError(err));
  }finally{
    submit.disabled = false;
  }
});

claimForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  claimErrorEl.classList.add("hidden");

  const token = await getAccessToken();
  const submit = document.getElementById("claim-submit");
  submit.disabled = true;

  try{
    const res = await fetch(`${API}/projects/${projectId}/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        username: document.getElementById("old-username").value.trim(),
        password: document.getElementById("old-password").value
      })
    });

    if(!res.ok){
      showClaimError(await readError(res, "Não deu pra ligar o projeto à sua conta."));
      return;
    }

    const data = await res.json();
    saveSession(data.project, token);
    window.location.href = "ambientes.html";

  }catch{
    showClaimError("Não foi possível conectar ao servidor. O backend está rodando?");
  }finally{
    submit.disabled = false;
  }
});

// entrar num projeto SEMPRE pede e-mail e senha. Se já há uma conta conectada,
// só deixa o e-mail preenchido e avisa.
document.getElementById("claim-back").addEventListener("click", (e) => {
  e.preventDefault();
  claimForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
  document.getElementById("password").focus();
});

(async function prefill(){
  const user = await getAccountUser();
  const emailInput = document.getElementById("email");

  if(user && user.email){
    emailInput.value = user.email;

    const note = document.getElementById("session-note");
    note.textContent = `Você está conectada como ${user.email}. Por segurança, confirme a senha para entrar neste projeto, ou use outra conta.`;
    note.classList.remove("hidden");

    document.getElementById("password").focus();
  }else{
    emailInput.focus();
  }
})();
