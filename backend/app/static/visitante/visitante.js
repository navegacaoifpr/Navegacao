const API = window.location.origin;

// por enquanto o visitante só vê o IFPR (dá pra trocar com ?project=ID)
const DEFAULT_PROJECT_NAME = "IFPR";

const track = document.getElementById("env-track");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const dotsBox = document.getElementById("carousel-dots");

function escapeHtml(text){
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function showMessage(text){
  track.innerHTML = `<p class="visit-message">${escapeHtml(text)}</p>`;
  updateCarousel();
}

async function findProject(){
  const projects = await fetch(`${API}/projects/`).then(r => r.json());
  const wanted = Number(new URLSearchParams(window.location.search).get("project"));

  return projects.find(p => p.id === wanted)
    || projects.find(p => p.name === DEFAULT_PROJECT_NAME)
    || projects[0]
    || null;
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

function buildCard(env){
  const card = document.createElement("a");
  card.className = "env-card";

  // o visualizador começa na foto de partida desse ambiente
  card.href = `../viewer/index.html?start=${env.start_node_id}`;

  card.innerHTML = `
    ${photoHtml(env.cover_image, env.name)}
    <div class="env-info">
      <span class="env-name">${escapeHtml(env.name)}</span>
      ${env.description ? `<span class="env-description">${escapeHtml(env.description)}</span>` : ""}
    </div>
  `;

  return card;
}

/* =========================
   CARROSSEL
========================= */

const CAROUSEL_GAP = 26;     // espaço entre os cards (igual ao gap do CSS)
const CAROUSEL_PADDING = 12; // padding interno do track: 6px de cada lado

// quanto andar a cada clique: a largura de um card + o espaço entre eles
function step(){
  const card = track.querySelector(".env-card");
  return card ? card.offsetWidth + CAROUSEL_GAP : track.clientWidth;
}

// quantas "posições" de rolagem existem (cards que não cabem de uma vez)
function scrollPositions(){
  const cards = track.querySelectorAll(".env-card");
  const visible = Math.max(1, Math.floor((track.clientWidth - CAROUSEL_PADDING + CAROUSEL_GAP + 1) / step()));
  return Math.max(1, cards.length - visible + 1);
}

function updateCarousel(){
  const positions = scrollPositions();
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
track.addEventListener("scroll", () => requestAnimationFrame(updateCarousel));
window.addEventListener("resize", updateCarousel);

/* =========================
   CARREGAR AMBIENTES
========================= */

async function loadEnvironments(){
  try{
    const project = await findProject();

    if(!project){
      showMessage("Nenhum projeto cadastrado ainda.");
      return;
    }

    document.title = `${project.name} - Onde você quer começar?`;

    const res = await fetch(`${API}/projects/${project.id}/environments`);

    if(!res.ok){
      showMessage("Não deu pra carregar os ambientes.");
      return;
    }

    const envs = await res.json();

    // intersecção não vira card, e ambiente sem foto não tem onde começar
    const visible = envs.filter(e => e.kind === "comum" && e.start_node_id);

    track.innerHTML = "";

    if(visible.length === 0){
      showMessage("Ainda não há ambientes disponíveis para visitar.");
      return;
    }

    visible.forEach(env => track.appendChild(buildCard(env)));
    updateCarousel();

  }catch{
    showMessage("Não foi possível conectar ao servidor. Tente novamente em instantes.");
  }
}

loadEnvironments();
