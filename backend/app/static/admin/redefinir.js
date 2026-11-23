const requestForm = document.getElementById("request-form");
const resetForm = document.getElementById("reset-form");
const backLink = document.getElementById("back-link");

function show(el, message){
  el.textContent = message;
  el.classList.remove("hidden");
}

function hide(el){
  el.classList.add("hidden");
}

function showResetStep(){
  requestForm.classList.add("hidden");
  resetForm.classList.remove("hidden");
  document.getElementById("page-title").textContent = "Nova senha";
}

if(!sb){
  show(document.getElementById("request-error"), configMissingMessage());
}else{

  // quem abre o link do e-mail chega aqui com uma sessão de recuperação:
  // o Supabase avisa com o evento PASSWORD_RECOVERY
  sb.auth.onAuthStateChange((event) => {
    if(event === "PASSWORD_RECOVERY"){
      showResetStep();
    }
  });

  if(window.location.hash.includes("type=recovery")){
    showResetStep();
  }

  /* PASSO 1: pedir o link */
  requestForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const okEl = document.getElementById("request-ok");
    const errorEl = document.getElementById("request-error");
    hide(okEl);
    hide(errorEl);

    const email = document.getElementById("email").value.trim();
    const submit = document.getElementById("request-submit");
    submit.disabled = true;

    try{
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: pageUrl("redefinir.html")
      });

      if(error){
        show(errorEl, authError(error));
        return;
      }

      // não diz se o e-mail existe ou não (não revela quem tem conta)
      show(okEl, "Se existir uma conta com esse e-mail, enviamos o link. Confira a caixa de entrada e o spam.");

    }catch(err){
      show(errorEl, authError(err));
    }finally{
      submit.disabled = false;
    }
  });

  /* PASSO 2: nova senha */
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const okEl = document.getElementById("reset-ok");
    const errorEl = document.getElementById("reset-error");
    hide(okEl);
    hide(errorEl);

    const password = document.getElementById("new-password").value;

    if(password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)){
      show(errorEl, "A senha precisa ter 8 ou mais caracteres, com letras e números.");
      return;
    }

    if(password !== document.getElementById("new-password2").value){
      show(errorEl, "As senhas não são iguais.");
      return;
    }

    const submit = document.getElementById("reset-submit");
    submit.disabled = true;

    try{
      const { error } = await sb.auth.updateUser({ password });

      if(error){
        show(errorEl, authError(error));
        return;
      }

      show(okEl, "Senha redefinida! Agora é só entrar com a nova senha.");
      resetForm.querySelectorAll("input").forEach(i => i.disabled = true);
      backLink.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Ir para os projetos e entrar';

      // encerra a sessão de recuperação, pra entrar de novo com a senha nova
      await sb.auth.signOut();

    }catch(err){
      show(errorEl, authError(err));
    }finally{
      submit.disabled = false;
    }
  });
}
