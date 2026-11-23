// 1ª tela do visitante: escolher a instituição (projeto)

const carousel = setupCarousel();

async function loadProjects(){
    try{
        const res = await fetch(`${API}/projects/`);

        if(!res.ok){
            carousel.message("Não deu pra carregar as instituições.");
            return;
        }

        const projects = await res.json();

        if(projects.length === 0){
            carousel.message("Nenhuma instituição cadastrada ainda.");
            return;
        }

        carousel.track.innerHTML = "";

        projects.forEach(p => carousel.track.appendChild(buildCard({
            href: `ambientes.html?project=${p.id}`,
            image: p.cover_image,
            name: p.name,
            description: p.description,
            icon: "bi-building"
        })));

        carousel.update();

    }catch{
        carousel.message("Não foi possível conectar ao servidor. Tente novamente em instantes.");
    }
}

loadProjects();
