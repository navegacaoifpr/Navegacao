// ambiente aberto no editor (vem da URL: admin.html?env=3)
const ENV_ID = Number(new URLSearchParams(window.location.search).get("env"));
let currentEnvironment = null;

// portas: fotos deste ambiente que levam a outro ambiente
let doorsByNode = {};

let cy;
let clickPosition = null;
let selectedNodeId = null;

let edgeStartNode = null;
let selectedEdgeId = null;
let newEdgeData = null;

async function loadGraph(){

// só as fotos e conexões DESTE ambiente
const nodes = await fetch(`http://127.0.0.1:8000/nodes/?environment_id=${ENV_ID}`).then(r=>r.json());
const edges = await fetch(`http://127.0.0.1:8000/edges/?environment_id=${ENV_ID}`).then(r=>r.json());

const placedNodes = nodes.filter(n => n.x !== null && n.y !== null);
const placedIds = new Set(placedNodes.map(n => String(n.id)));

// se o grafo já existe (recarregando), guarda zoom e posição da câmera
// e destrói o antigo, pra não empilhar dois grafos no mesmo lugar
let savedView = null;

if(cy){
savedView = { zoom: cy.zoom(), pan: cy.pan() };
cy.destroy();
}

cy = cytoscape({
container: document.getElementById("cy"),

elements: [
// prefixo "n"/"e" garante que o ID nunca colide entre node e edge,
// já que cada um vem de uma tabela diferente com seu próprio
// auto-incremento (podia existir node #1 E edge #1 ao mesmo tempo)
...placedNodes.map(n => ({
data:{
id:"n"+n.id,
dbId:n.id,
label:n.name,
image:`http://127.0.0.1:8000/images/thumbs/${encodeURIComponent(n.image)}`
},
position:{ x:n.x, y:n.y }
})),

...edges
.filter(e => e.source_id && e.target_id)
.filter(e => placedIds.has(String(e.source_id)) && placedIds.has(String(e.target_id)))
.map(e => ({
data:{
id:"e"+e.id,
dbId:e.id,
source:"n"+e.source_id,
target:"n"+e.target_id,
label:e.direction
}
}))
],

style:[
{
selector:"node",
style:{
"shape":"rectangle",
"width":80,
"height":80,
"background-image":"data(image)",
"background-fit":"cover",
"background-color":"#ccc",
"label":"data(label)",
"text-valign":"bottom",
"text-halign":"center",
"text-max-width":"90px",
"text-wrap":"ellipsis",
"color":"#000",
"font-size":10,
"border-width":2,
"border-color":"#2E86DE"
}
},
{
// foto que é passagem pra outro ambiente
selector:"node.door",
style:{
"border-width":6,
"border-color":"#f0a400"
}
},
{
selector:"edge",
style:{
"label":"data(label)",
"target-arrow-shape":"triangle",
"curve-style":"bezier",
"line-color":"#4D7C32",
"target-arrow-color":"#4D7C32",
"width":2,
"font-size":10
}
}
],

layout:{ name:"preset" }
});

if(savedView){
cy.zoom(savedView.zoom);
cy.pan(savedView.pan);
}

events();

await loadDoors();
}

function events(){

cy.on("tap", e=>{
if(e.target !== cy) return;
clickPosition = e.position;
openCreateModal();
});

cy.on("tap","node", async e=>{

const node = e.target;

if(e.originalEvent.shiftKey){

if(!edgeStartNode){
edgeStartNode = node;
node.style("border-color","red");
return;
}

createEdge(edgeStartNode.data("dbId"), node.data("dbId"));

edgeStartNode.style("border-color","#2E86DE");
edgeStartNode = null;

return;
}

openEditModal(node.data("dbId"));

});

cy.on("tap","edge", e=>{
selectedEdgeId = e.target.data("dbId");
openEdgeModal(e.target.data("label"));
});

cy.on("dragfree","node", async e=>{
await updatePosition(e.target.data("dbId"), e.target.position());
});

}

function openCreateModal(){
selectedNodeId = null;

document.getElementById("modal-title").innerText = "Novo Node";
document.getElementById("start-node-btn").classList.add("hidden");
document.getElementById("passage-btn").classList.add("hidden");
document.getElementById("door-info").classList.add("hidden");
document.getElementById("node-name").value = "";

const preview = document.getElementById("preview");
preview.style.display = "none";

document.getElementById("modal").classList.remove("hidden");
}

async function openEditModal(id){

selectedNodeId = id;

const node = await fetch(`http://127.0.0.1:8000/nodes/${id}`).then(r=>r.json());

document.getElementById("modal-title").innerText = "Editar Node";

const startBtn = document.getElementById("start-node-btn");
startBtn.classList.remove("hidden");
const isStart = currentEnvironment && currentEnvironment.start_node_id === id;
startBtn.innerHTML = isStart
? '<i class="bi bi-flag-fill"></i> Esta é a foto de partida'
: '<i class="bi bi-flag"></i> Definir como foto de partida';

document.getElementById("passage-btn").classList.remove("hidden");
renderDoorInfo(id);
document.getElementById("node-name").value = node.name;

const preview = document.getElementById("preview");
preview.src = `http://127.0.0.1:8000/images/${encodeURIComponent(node.image)}`;
preview.style.display = "block";

document.getElementById("modal").classList.remove("hidden");
}

function closeModal(){
document.getElementById("modal").classList.add("hidden");
}

async function saveNode(){

const name = document.getElementById("node-name").value;
const file = document.getElementById("node-image").files[0];

let image = null;

if(file){
image = await upload(file);
}

let res;

if(selectedNodeId){

if(!image){

const node = await fetch(
`http://127.0.0.1:8000/nodes/${selectedNodeId}`
).then(r=>r.json());

image = node.image;
}

res = await fetch(`http://127.0.0.1:8000/nodes/${selectedNodeId}`,{
method:"PUT",
headers:{ "Content-Type":"application/json" },
body: JSON.stringify({
name,
image
})
});

}else{

if(!image){
image = "placeholder.jpg";
}

res = await fetch("http://127.0.0.1:8000/nodes/",{
method:"POST",
headers:{ "Content-Type":"application/json" },
body: JSON.stringify({
name,
image,
x:clickPosition.x,
y:clickPosition.y,
environment_id:ENV_ID
})
});
}

if(!res.ok){
const data = await res.json().catch(() => ({}));
showToast(data.detail || "Não deu pra salvar o node.", "error");
return;
}

location.reload();
}

async function deleteNodeFromModal(){

    if(!selectedNodeId) return;

    // avisa antes de apagar uma foto que é passagem pra outro ambiente
    const doors = doorsByNode[selectedNodeId] || [];

    if(doors.length){
        const places = [...new Set(doors.map(d => d.to_environment_name))].join(", ");
        if(!confirm(`Esta foto é a passagem para: ${places}. Excluir a foto também desfaz essa passagem. Continuar?`)){
            return;
        }
    }

    const res = await fetch(`http://127.0.0.1:8000/nodes/${selectedNodeId}`,{
    method:"DELETE"
    });

    if(!res.ok){
        const data = await res.json().catch(() => ({}));
        showToast(data.detail || "Não deu pra excluir o node.", "error");
        return;
    }

    location.reload();
}

function openEdgeModal(dir){

  document.getElementById("edge-direction").value = dir || "north";

  document.getElementById("edge-modal")
  .classList.remove("hidden");
}

function closeEdgeModal(){

    document.getElementById("edge-modal")
    .classList.add("hidden");
}

async function saveEdge(){

  const dir = document.getElementById("edge-direction").value;

  let res;

  // editar
  if(selectedEdgeId){

    res = await fetch(
      `http://127.0.0.1:8000/edges/${selectedEdgeId}?direction=${dir}`,
      { method:"PUT" }
    );

  }

  // criar
  else if(newEdgeData){

    const params = new URLSearchParams({
      source_id: newEdgeData.source,
      target_id: newEdgeData.target,
      direction: dir
    });

    res = await fetch(
      `http://127.0.0.1:8000/edges/?${params}`,
      { method:"POST" }
    );

  }

  if(!res.ok){
    const data = await res.json().catch(() => ({}));
    showToast(data.detail || "Não deu pra salvar essa conexão.", "error");
    return;
  }

  location.reload();
}

async function deleteEdge(){

    const res = await fetch(
    `http://127.0.0.1:8000/edges/${selectedEdgeId}`,
    {
    method:"DELETE"
    });

    if(!res.ok){
        const data = await res.json().catch(() => ({}));
        showToast(data.detail || "Não deu pra excluir a conexão.", "error");
        return;
    }

location.reload();
}

function createEdge(source, target){

  newEdgeData = {
    source: source,
    target: target
  };

  selectedEdgeId = null;

  openEdgeModal();
}

async function upload(file){

const form = new FormData();

form.append("file", file);

const res = await fetch(
"http://127.0.0.1:8000/nodes/upload",
{
method:"POST",
body: form
});

const data = await res.json();

return data.filename;
}

async function updatePosition(id,pos){

await fetch(`http://127.0.0.1:8000/nodes/${id}`,{
method:"PUT",
headers:{ "Content-Type":"application/json" },
body: JSON.stringify(pos)
});
}

function cyPositionFromEvent(evt){

const rect = cy.container().getBoundingClientRect();

const renderedX = evt.clientX - rect.left;
const renderedY = evt.clientY - rect.top;

const pan = cy.pan();
const zoom = cy.zoom();

return {
x: (renderedX - pan.x) / zoom,
y: (renderedY - pan.y) / zoom
};

}

function gridPositionsAround(count, center, spacing=110){

const cols = Math.ceil(Math.sqrt(count));
const rows = Math.ceil(count / cols);

const startX = center.x - ((cols - 1) * spacing) / 2;
const startY = center.y - ((rows - 1) * spacing) / 2;

const positions = [];

for(let i = 0; i < count; i++){
const col = i % cols;
const row = Math.floor(i / cols);

positions.push({
x: startX + col * spacing,
y: startY + row * spacing
});
}

return positions;

}

async function placeNodeAt(nodeId, pos){

await fetch(`http://127.0.0.1:8000/nodes/${nodeId}`,{
method:"PUT",
headers:{ "Content-Type":"application/json" },
body: JSON.stringify({
x: Math.round(pos.x),
y: Math.round(pos.y)
})
});

}

function setupCanvasDropZone(){

const container = document.getElementById("cy");

container.addEventListener("dragover", e=>{
e.preventDefault();
container.classList.add("drop-target");
});

container.addEventListener("dragleave", ()=>{
container.classList.remove("drop-target");
});

container.addEventListener("drop", async e=>{

e.preventDefault();
container.classList.remove("drop-target");

const type = e.dataTransfer.getData("type");
const dropPos = cyPositionFromEvent(e);

if(type === "image"){

const nodeId = e.dataTransfer.getData("nodeId");
await placeNodeAt(nodeId, dropPos);
location.reload();

}else if(type === "folder"){

const folderId = e.dataTransfer.getData("folderId");

const images = await fetch(
`http://127.0.0.1:8000/folders/${folderId}/images`
).then(r=>r.json());

const unplaced = images.filter(n => n.x === null || n.y === null);

if(unplaced.length === 0){
showToast("Todas as imagens dessa pasta já estão no mapa.", "error");
return;
}

const positions = gridPositionsAround(unplaced.length, dropPos);

await Promise.all(
unplaced.map((n, i) => placeNodeAt(n.id, positions[i]))
);

location.reload();

}

});

}

function setupViewerPip(){

const pip = document.getElementById("viewer-pip");
const btn = document.getElementById("viewer-btn");
const header = pip.querySelector(".pip-header");
const iframe = document.getElementById("pip-iframe");
const resizeHandle = pip.querySelector(".pip-resize-handle");

let iframeLoaded = false;

function openPip(){
if(!iframeLoaded){
// começa na foto de partida do ambiente aberto no editor
const start = currentEnvironment && currentEnvironment.start_node_id;
iframe.src = "http://127.0.0.1:8000/static/viewer/index.html" + (start ? `?start=${start}` : "");
iframeLoaded = true;
}
pip.classList.remove("hidden");
btn.classList.add("active");
}

function closePip(){
pip.classList.add("hidden");
btn.classList.remove("active");
}

function togglePip(){
pip.classList.contains("hidden") ? openPip() : closePip();
}

btn.addEventListener("click", togglePip);

document.getElementById("pip-close").addEventListener("click", e=>{
e.stopPropagation();
closePip();
});

document.getElementById("pip-minimize").addEventListener("click", e=>{
e.stopPropagation();
pip.classList.remove("fullscreen");
pip.classList.toggle("minimized");
});

document.getElementById("pip-fullscreen").addEventListener("click", e=>{
e.stopPropagation();
pip.classList.remove("minimized");
pip.classList.toggle("fullscreen");
});

header.addEventListener("dblclick", ()=>{
pip.classList.remove("minimized");
pip.classList.toggle("fullscreen");
});

// arrastar pelo cabeçalho
let dragging = false;
let offsetX = 0;
let offsetY = 0;

header.addEventListener("mousedown", e=>{
if(pip.classList.contains("fullscreen")) return;
if(e.target.closest(".pip-controls")) return;

dragging = true;

const rect = pip.getBoundingClientRect();
offsetX = e.clientX - rect.left;
offsetY = e.clientY - rect.top;
});

document.addEventListener("mousemove", e=>{
if(!dragging) return;

pip.style.left = (e.clientX - offsetX) + "px";
pip.style.top = (e.clientY - offsetY) + "px";
});

document.addEventListener("mouseup", ()=>{
dragging = false;
});

// redimensionar pelo cantinho
let resizing = false;
let startW = 0;
let startH = 0;
let startX = 0;
let startY = 0;

resizeHandle.addEventListener("mousedown", e=>{
resizing = true;

const rect = pip.getBoundingClientRect();
startW = rect.width;
startH = rect.height;
startX = e.clientX;
startY = e.clientY;

e.preventDefault();
});

document.addEventListener("mousemove", e=>{
if(!resizing) return;

pip.style.width = Math.max(240, startW + (e.clientX - startX)) + "px";
pip.style.height = Math.max(160, startH + (e.clientY - startY)) + "px";
});

document.addEventListener("mouseup", ()=>{
resizing = false;
});

}

function enableDragModal(){

document.querySelectorAll(".modal-header").forEach(header=>{

let dragging = false;
let offsetX = 0;
let offsetY = 0;

const modal = header.parentElement;

header.addEventListener("mousedown", (e)=>{
dragging = true;

offsetX = e.clientX - modal.offsetLeft;
offsetY = e.clientY - modal.offsetTop;
});

document.addEventListener("mousemove", (e)=>{
if(!dragging) return;

modal.style.left = (e.clientX - offsetX) + "px";
modal.style.top = (e.clientY - offsetY) + "px";

modal.style.transform = "none";
});

document.addEventListener("mouseup", ()=>{
dragging = false;
});

});

}

/* =========================
   AMBIENTE ABERTO
========================= */

async function loadEnvironmentInfo(){

const res = await fetch(`http://127.0.0.1:8000/environments/${ENV_ID}`);

if(!res.ok){
showToast("Ambiente não encontrado.", "error");
setTimeout(() => window.location.href = "ambientes.html", 1500);
return;
}

currentEnvironment = await res.json();

// o mapa de ligação não tem fotos: abre na tela própria dele
if(currentEnvironment.kind === "mapa"){
window.location.href = `mapa.html?env=${ENV_ID}`;
return;
}

document.getElementById("env-title").textContent = currentEnvironment.name;
document.title = `${currentEnvironment.name} - Administrador`;

const badge = document.getElementById("env-kind-badge");
const isIntersection = currentEnvironment.kind === "intersecao";

badge.className = `perfil kind-${currentEnvironment.kind}`;
badge.innerHTML = isIntersection
? '<i class="bi bi-circle-fill"></i> Intersecção (caminho)'
: '<i class="bi bi-circle-fill"></i> Ambiente comum';
}

// a foto de partida é onde o visitante começa ao escolher esse ambiente
async function setAsStartNode(){

if(!selectedNodeId) return;

const res = await fetch(`http://127.0.0.1:8000/environments/${ENV_ID}`,{
method:"PUT",
headers:{ "Content-Type":"application/json" },
body: JSON.stringify({ start_node_id: selectedNodeId })
});

if(!res.ok){
const data = await res.json().catch(() => ({}));
showToast(data.detail || "Não deu pra definir a foto de partida.", "error");
return;
}

currentEnvironment = await res.json();

document.getElementById("start-node-btn").innerHTML =
'<i class="bi bi-flag-fill"></i> Esta é a foto de partida';

showToast("Foto de partida definida!");
}

/* =========================
   PORTAS (passagens pra outros ambientes)
========================= */

const DIRECTION_NAMES = { north:"Norte", south:"Sul", east:"Leste", west:"Oeste" };

async function loadDoors(){

doorsByNode = {};

try{
const doors = await fetch(`http://127.0.0.1:8000/environments/${ENV_ID}/doors`).then(r=>r.json());

doors.forEach(d => {
(doorsByNode[d.node_id] = doorsByNode[d.node_id] || []).push(d);
});
}catch{
return;
}

if(!cy) return;

cy.nodes().removeClass("door");

Object.keys(doorsByNode).forEach(nodeId => {
cy.getElementById("n" + nodeId).addClass("door");
});
}

function renderDoorInfo(nodeId){

const box = document.getElementById("door-info");
const doors = doorsByNode[nodeId] || [];

if(doors.length === 0){
box.classList.add("hidden");
box.innerHTML = "";
return;
}

box.innerHTML = "<b>Esta foto é uma passagem:</b>";

doors.forEach(d => {
const row = document.createElement("div");
row.className = "door-row";

const text = document.createElement("span");
text.textContent = `${DIRECTION_NAMES[d.direction] || d.direction} → ${d.to_environment_name} (${d.to_node_name})`;

const btn = document.createElement("button");
btn.className = "danger";
btn.textContent = "Desfazer";
btn.onclick = () => removeDoor(d);

row.appendChild(text);
row.appendChild(btn);
box.appendChild(row);
});

box.classList.remove("hidden");
}

async function removeDoor(door){

if(!confirm(`Desfazer a passagem para ${door.to_environment_name}?`)) return;

const res = await fetch(
`http://127.0.0.1:8000/intersections/${door.map_id}/links/${door.link_id}`,
{ method:"DELETE" }
);

if(!res.ok){
const data = await res.json().catch(() => ({}));
showToast(data.detail || "Não deu pra desfazer a passagem.", "error");
return;
}

await loadDoors();
renderDoorInfo(selectedNodeId);
showToast("Passagem desfeita.");
}

/* ---------- modal "Nova passagem" ---------- */

let passageMapId = null;

// fotos de um ambiente, agrupadas por pasta
async function fillPassagePhotos(envId){

const select = document.getElementById("passage-target-node");
const preview = document.getElementById("passage-preview");

const [nodes, folders] = await Promise.all([
fetch(`http://127.0.0.1:8000/nodes/?environment_id=${envId}`).then(r=>r.json()),
fetch(`http://127.0.0.1:8000/folders/?environment_id=${envId}`).then(r=>r.json())
]);

const folderNames = Object.fromEntries(folders.map(f => [f.id, f.name]));
select.innerHTML = "";

if(nodes.length === 0){
select.innerHTML = '<option value="">Esse ambiente ainda não tem fotos</option>';
preview.classList.add("hidden");
return;
}

const groups = {};

nodes.forEach(n => {
const folder = folderNames[n.folder_id] || "Sem pasta";
(groups[folder] = groups[folder] || []).push(n);
});

Object.keys(groups).sort().forEach(folder => {
const group = document.createElement("optgroup");
group.label = folder;

groups[folder]
.sort((a, b) => (a.chain_order ?? 1e9) - (b.chain_order ?? 1e9) || (a.image || "").localeCompare(b.image || ""))
.forEach(n => {
const opt = document.createElement("option");
opt.value = n.id;
opt.textContent = n.name;
opt.dataset.image = n.image || "";
group.appendChild(opt);
});

select.appendChild(group);
});

const updatePreview = () => {
const image = select.selectedOptions[0]?.dataset.image;
if(image){
preview.src = `http://127.0.0.1:8000/images/thumbs/${encodeURIComponent(image)}`;
preview.classList.remove("hidden");
}else{
preview.classList.add("hidden");
}
};

select.onchange = updatePreview;
updatePreview();
}

async function openPassageModal(){

if(!selectedNodeId) return;

const session = getSession();

const [envs, map] = await Promise.all([
fetch(`http://127.0.0.1:8000/projects/${session.projectId}/environments`).then(r=>r.json()),
fetch(`http://127.0.0.1:8000/projects/${session.projectId}/map`).then(r=>r.json())
]);

passageMapId = map.id;

const others = envs.filter(e => (e.kind === "comum" || e.kind === "intersecao") && e.id !== ENV_ID);

if(others.length === 0){
showToast("Crie outro ambiente antes de fazer uma passagem.", "error");
return;
}

document.getElementById("passage-source").textContent =
document.getElementById("node-name").value || `Foto ${selectedNodeId}`;

const envSelect = document.getElementById("passage-target-env");
envSelect.innerHTML = "";

others.forEach(e => {
const opt = document.createElement("option");
opt.value = e.id;
opt.textContent = e.kind === "intersecao" ? `${e.name} (intersecção)` : e.name;
envSelect.appendChild(opt);
});

envSelect.onchange = () => fillPassagePhotos(Number(envSelect.value));
await fillPassagePhotos(Number(envSelect.value));

document.getElementById("passage-modal").classList.remove("hidden");
}

function closePassageModal(){
document.getElementById("passage-modal").classList.add("hidden");
}

async function confirmPassage(){

const target = Number(document.getElementById("passage-target-node").value);
const direction = document.getElementById("passage-direction").value;

if(!target){
showToast("Esse ambiente ainda não tem fotos pra receber a passagem.", "error");
return;
}

const res = await fetch(`http://127.0.0.1:8000/intersections/${passageMapId}/links`,{
method:"POST",
headers:{ "Content-Type":"application/json" },
body: JSON.stringify({
source_node_id: selectedNodeId,
target_node_id: target,
direction
})
});

if(!res.ok){
const data = await res.json().catch(() => ({}));
showToast(data.detail || "Não deu pra criar a passagem.", "error");
return;
}

closePassageModal();
await loadDoors();
renderDoorInfo(selectedNodeId);
showToast("Passagem criada! Ela também aparece no mapa de ligação.");
}

window.onload = ()=>{
loadEnvironmentInfo();
loadGraph();
enableDragModal();
setupCanvasDropZone();
setupViewerPip();
};