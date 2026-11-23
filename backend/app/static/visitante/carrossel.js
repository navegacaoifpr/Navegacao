// Carrossel compartilhado pelas telas do visitante (instituições e ambientes)

const API = window.location.origin;

function escapeHtml(text){
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

const CAROUSEL_GAP = 26;     // espaço entre os cards (igual ao gap do CSS)
const CAROUSEL_PADDING = 12; // padding interno do track: 6px de cada lado

function setupCarousel(){
  const track = document.getElementById("card-track");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const dotsBox = document.getElementById("carousel-dots");

  // quanto andar a cada clique: a largura de um card + o espaço entre eles
  const step = () => {
    const card = track.querySelector(".env-card");
    return card ? card.offsetWidth + CAROUSEL_GAP : track.clientWidth;
  };

  // quantos cards cabem de uma vez e quantas "posições" de rolagem existem
  function metrics(){
    const cards = track.querySelectorAll(".env-card");
    const visible = Math.max(1, Math.floor((track.clientWidth - CAROUSEL_PADDING + CAROUSEL_GAP + 1) / step()));
    const positions = Math.max(1, cards.length - visible + 1);
    return { positions };
  }

  function update(){
    const { positions } = metrics();
    const overflow = positions > 1;

    // setas e bolinhas só aparecem quando tem card fora da tela
    prevBtn.classList.toggle("hidden", !overflow);
    nextBtn.classList.toggle("hidden", !overflow);

    prevBtn.disabled = track.scrollLeft <= 2;
    nextBtn.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;

    dotsBox.innerHTML = "";
    if(!overflow) return;

    // uma bolinha por posição de rolagem
    const current = Math.min(Math.round(track.scrollLeft / step()), positions - 1);

    for(let i = 0; i < positions; i++){
      const dot = document.createElement("span");
      if(i === current) dot.className = "active";
      dotsBox.appendChild(dot);
    }
  }

  prevBtn.addEventListener("click", () => track.scrollBy({ left: -step() }));
  nextBtn.addEventListener("click", () => track.scrollBy({ left: step() }));
  track.addEventListener("scroll", () => requestAnimationFrame(update));
  window.addEventListener("resize", update);

  return {
    track,
    update,
    message(text){
      track.innerHTML = `<p class="visit-message">${escapeHtml(text)}</p>`;
      update();
    }
  };
}

// fundo colorido com as iniciais, para ambientes/projetos sem foto
function placeholderTone(name){
  let hash = 0;
  for(const ch of String(name || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 5;
}

function placeholderInitials(name){
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if(!words.length) return "?";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

function photoHtml(image, name, extraIcon){
  if(image){
    const url = `${API}/images/thumbs/${encodeURIComponent(image)}`.replace(/'/g, "%27");
    return `<div class="env-photo" style="background-image:url('${url}')"></div>`;
  }

  return `<div class="env-photo no-photo tone-${placeholderTone(name)}"><span>${escapeHtml(placeholderInitials(name))}</span></div>`;
}

// card no formato da página de entrada: foto em cima, nome e descrição embaixo
function buildCard({ href, image, name, description, icon = "bi-image" }){
  const card = document.createElement("a");
  card.className = "env-card";
  card.href = href;

  card.innerHTML = `
    ${photoHtml(image, name)}
    <div class="env-info">
      <span class="env-name">${escapeHtml(name)}</span>
      ${description ? `<span class="env-description">${escapeHtml(description)}</span>` : ""}
    </div>
  `;

  return card;
}
