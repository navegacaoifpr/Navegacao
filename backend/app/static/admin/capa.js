// Ajudantes de foto de capa (usados em projetos.html e ambientes.html).
//
//  - cardImageHtml(): o "topo" do card. Com foto, mostra a foto; sem foto, mostra
//    um fundo colorido com as iniciais do nome (em vez do quadradinho cinza vazio);
//  - setupCoverPicker(): troca o "escolher arquivo" feio por uma área com
//    pré-visualização, que aceita clicar ou arrastar a foto.

const COVER_TONES = 5;
const COVER_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function coverTone(name){
  let hash = 0;
  for(const ch of String(name || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % COVER_TONES;
}

function coverInitials(name){
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if(!words.length) return "?";
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

function cssUrl(url){
  return String(url).replace(/'/g, "%27");
}

function cardImageHtml(coverUrl, name){
  if(coverUrl){
    return `<div class="card-image" style="background-image:url('${cssUrl(coverUrl)}')"></div>`;
  }

  return `
    <div class="card-image no-cover tone-${coverTone(name)}">
      <span class="cover-initials">${escapeHtml(coverInitials(name))}</span>
      <small class="cover-caption"><i class="bi bi-camera"></i> Sem foto</small>
    </div>`;
}

/* =========================
   ESCOLHER FOTO (com prévia)
========================= */

function setupCoverPicker(input, hintText){
  // o <input type=file> continua existindo (o código dos formulários lê ele),
  // só fica escondido atrás da área bonita
  input.removeAttribute("required");
  input.style.display = "none";

  const picker = document.createElement("div");
  picker.className = "cover-picker";
  picker.innerHTML = `
    <div class="cover-picker-preview" tabindex="0" role="button" aria-label="Escolher foto">
      <div class="cover-picker-empty">
        <i class="bi bi-image"></i>
        <span>Clique ou arraste uma foto aqui</span>
      </div>
    </div>
    <div class="cover-picker-bar">
      <span class="cover-picker-name"></span>
      <button type="button" class="cover-picker-clear hidden"><i class="bi bi-x-lg"></i> Tirar escolha</button>
    </div>
  `;

  input.insertAdjacentElement("afterend", picker);

  const preview = picker.querySelector(".cover-picker-preview");
  const nameEl = picker.querySelector(".cover-picker-name");
  const clearBtn = picker.querySelector(".cover-picker-clear");

  let currentUrl = null;
  let objectUrl = null;

  function paint(){
    const url = objectUrl || currentUrl;
    preview.classList.toggle("has-image", !!url);
    preview.style.backgroundImage = url ? `url('${cssUrl(url)}')` : "";

    const file = input.files[0];
    clearBtn.classList.toggle("hidden", !file);

    if(file){
      nameEl.textContent = file.name;
    }else if(currentUrl){
      nameEl.textContent = hintText || "Foto atual. Clique para trocar.";
    }else{
      nameEl.textContent = "";
    }
  }

  function setFile(file){
    if(objectUrl){
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }

    if(!file){
      input.value = "";
      paint();
      return;
    }

    if(!file.type.startsWith("image/")){
      input.value = "";
      paint();
      painelToast("Esse arquivo não é uma imagem. Escolha uma foto (JPG, PNG...).", "error");
      return;
    }

    if(file.size > COVER_MAX_BYTES){
      input.value = "";
      paint();
      painelToast("A foto é grande demais (máximo 10 MB).", "error");
      return;
    }

    objectUrl = URL.createObjectURL(file);
    paint();
  }

  preview.addEventListener("click", () => input.click());
  preview.addEventListener("keydown", e => {
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      input.click();
    }
  });

  input.addEventListener("change", () => setFile(input.files[0] || null));

  clearBtn.addEventListener("click", () => {
    input.value = "";
    setFile(null);
  });

  // arrastar e soltar
  ["dragenter", "dragover"].forEach(type => preview.addEventListener(type, e => {
    e.preventDefault();
    preview.classList.add("dragover");
  }));

  ["dragleave", "drop"].forEach(type => preview.addEventListener(type, e => {
    e.preventDefault();
    preview.classList.remove("dragover");
  }));

  preview.addEventListener("drop", e => {
    const file = e.dataTransfer.files[0];
    if(!file) return;

    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    setFile(file);
  });

  paint();

  return {
    // chamar sempre que o modal abrir: limpa a escolha e mostra a foto atual (se tiver)
    reset(url){
      currentUrl = url || null;
      setFile(null);
    }
  };
}
