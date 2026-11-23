// Menu do site (botão "Menu" no canto + gaveta com as páginas).
// Uso: <link rel="stylesheet" href="…/assets/menu.css"> e <script src="…/assets/menu.js"></script>
// Os links são montados a partir do lugar onde este arquivo está, então funciona
// em qualquer pasta do site e em qualquer endereço (local ou hospedado).

(function(){

const script = document.currentScript;
const root = new URL("../", script.src).href; // a pasta que contém "assets/"

const ITEMS = [
  { href: "index.html",                              icon: "bi-house",         label: "Início" },
  { href: "paginas/sobre.html",                      icon: "bi-people",        label: "Sobre nós" },
  { href: "paginas/como-funciona-visitante.html",    icon: "bi-compass",       label: "Como funciona · Visitante" },
  { href: "paginas/como-funciona-admin.html",        icon: "bi-shield-lock",   label: "Como funciona · Administrador" },
  { href: "paginas/privacidade.html",                icon: "bi-shield-check",  label: "Privacidade" },
];

function isCurrent(url){
  const here = location.pathname.replace(/index\.html$/, "");
  const there = new URL(url).pathname.replace(/index\.html$/, "");
  return here === there;
}

const button = document.createElement("button");
button.type = "button";
button.className = "site-menu-btn";
button.setAttribute("aria-label", "Abrir menu");
button.setAttribute("aria-expanded", "false");
button.innerHTML = '<i class="bi bi-list"></i><span>Menu</span>';

const overlay = document.createElement("div");
overlay.className = "site-menu-overlay";

const drawer = document.createElement("nav");
drawer.className = "site-menu";
drawer.setAttribute("aria-label", "Menu do site");
drawer.innerHTML = `
  <div class="site-menu-head">
    <strong>Navegação IFPR</strong>
    <button type="button" class="site-menu-close" aria-label="Fechar menu"><i class="bi bi-x-lg"></i></button>
  </div>
  <ul>
    ${ITEMS.map(item => {
      const url = root + item.href;
      return `<li><a href="${url}" ${isCurrent(url) ? 'class="current" aria-current="page"' : ""}>
        <i class="bi ${item.icon}"></i><span>${item.label}</span></a></li>`;
    }).join("")}
  </ul>
  <p class="site-menu-foot">Trabalho de Conclusão de Curso · IFPR Campus Jacarezinho</p>
`;

function setOpen(open){
  drawer.classList.toggle("open", open);
  overlay.classList.toggle("open", open);
  button.setAttribute("aria-expanded", String(open));
  if(open) drawer.querySelector("a")?.focus();
  else button.focus({ preventScroll: true });
}

button.addEventListener("click", () => setOpen(!drawer.classList.contains("open")));
overlay.addEventListener("click", () => setOpen(false));
drawer.querySelector(".site-menu-close").addEventListener("click", () => setOpen(false));
document.addEventListener("keydown", e => {
  if(e.key === "Escape" && drawer.classList.contains("open")) setOpen(false);
});

function mount(){
  document.body.append(button, overlay, drawer);
}

if(document.body) mount();
else document.addEventListener("DOMContentLoaded", mount);

})();
