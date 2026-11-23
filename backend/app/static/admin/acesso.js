const next = safeNext(getQueryParam("next"), "projetos.html");
let mode = getQueryParam("mode") === "signup" ? "signup" : "login";

const form = document.getElementById("access-form");
const okEl = document.getElementById("access-ok");
const errorEl = document.getElementById("access-error");

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

function applyMode(){
  const signup = mode === "signup";

  document.getElementById("page-title").textContent = signup ? "Criar conta" : "Entrar na conta";
  document.getElementById("access-submit").textContent = signup ? "Criar conta" : "Entrar";
  document.getElementById("confirm-box").classList.toggle("hidden", !signup);
  document.getElementById("password2").required = signup;
  document.getElementById("password-hint").classList.toggle("hidden", !signup);
  document.getElementById("forgot-link").classList.toggle("hidden", signup);
  document.getElementById("password").autocomplete = signup ? "new-password" : "current-password";
  document.getElementById("switch-link").textContent = signup
    ? "Já tenho conta. Entrar"
    : "Não tenho conta. Criar conta";

  errorEl.classList.add("hidden");
  okEl.classList.add("hidden");
}

document.getElementById("switch-link").addEventListener("click", (e) => {
  e.preventDefault();
  mode = mode === "signup" ? "login" : "signup";
  applyMode();
});

applyMode();

if(!sb){
  showError(configMissingMessage());
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if(!sb){
    showError(configMissingMessage());
    return;
  }

  errorEl.classList.add("hidden");
  okEl.classList.add("hidden");

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if(mode === "signup"){
    if(password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)){
      showError("A senha precisa ter 8 ou mais caracteres, com letras e números.");
      return;
    }

    if(password !== document.getElementById("password2").value){
      showError("As senhas não são iguais.");
      return;
    }
  }

  const submit = document.getElementById("access-submit");
  submit.disabled = true;

  try{
    if(mode === "signup"){
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: pageUrl("acesso.html") }
      });

      if(error){
        showError(authError(error));
        return;
      }

      // se o Supabase exige confirmar o e-mail, ainda não há sessão
      if(data.session){
        window.location.href = next;
      }else{
        showOk("Conta criada! Enviamos um e-mail de confirmação. Abra o link (veja também o spam) e depois volte para entrar.");
        form.querySelectorAll("input").forEach(i => i.disabled = true);
      }

    }else{
      const { error } = await sb.auth.signInWithPassword({ email, password });

      if(error){
        showError(authError(error));
        return;
      }

      window.location.href = next;
    }

  }catch(err){
    showError(authError(err));
  }finally{
    submit.disabled = false;
  }
});

// já está logado? vai direto
if(sb){
  getAccountUser().then(user => {
    if(user && mode === "login" && getQueryParam("force") !== "1"){
      window.location.replace(next);
    }
  });
}
