// Coloca o painel verde com uma arte simples (à esquerda) nas telas de login, cadastro e redefinição.
// Sem animação, só cartões de foto ligados por linhas. Se este arquivo não carregar, a tela continua igual à de antes.

(function(){

if(document.querySelector(".login-art")) return;

const logoSrc = new URL("../assets/logo-ifpr.png", document.currentScript.src).href;

// um cartão de foto: moldura clara, céu, sol e morro
function foto(x, y){
  return `
  <g transform="translate(${x} ${y})">
    <rect width="120" height="90" rx="12" fill="#f8f5ee"/>
    <rect x="8" y="8" width="104" height="58" rx="7" fill="#d3e6c2"/>
    <circle cx="92" cy="26" r="7" fill="#f2d21b"/>
    <path d="M8 66 L44 30 L70 54 L88 40 L112 66 Z" fill="#4D7C32"/>
    <rect x="8" y="73" width="56" height="7" rx="3.5" fill="#d8d2c7"/>
  </g>`;
}

const arte = `
<svg class="login-art-svg" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
  <!-- linha ligando as fotos -->
  <path d="M110 80 L290 150 L130 235" fill="none" stroke="#fff" stroke-opacity=".5"
        stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>

  ${foto(30, 40)}
  ${foto(250, 105)}
  ${foto(70, 190)}

</svg>`;

const art = document.createElement("aside");
art.className = "login-art";
art.innerHTML = `
  <div class="login-art-logo">
    <img src="${logoSrc}" alt="Instituto Federal do Paraná - Jacarezinho"
         onerror="this.parentNode.hidden = true">
  </div>
  ${arte}
  <div class="login-art-text">
    <h2>Monte o caminho, foto a foto.</h2>
    <p>Cadastre os ambientes, conecte as fotos e deixe qualquer pessoa conhecer o campus de onde estiver.</p>
  </div>
`;

document.body.classList.add("com-arte");
document.body.prepend(art);

})();
