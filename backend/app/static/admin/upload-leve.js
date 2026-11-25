// =========================================================
// UPLOAD LEVE
// A Vercel só aceita envios de até 4,5 MB por vez. Este arquivo,
// carregado ANTES dos outros scripts, cuida disso sozinho:
//  1) reduz as fotos grandes (máx. 3000 px no lado maior, JPEG 85%)
//     - continua com ótima qualidade na tela, mas fica bem mais leve;
//  2) quando uma pasta inteira é enviada, manda uma foto por vez
//     e junta as respostas no final (o resto do código nem percebe).
// =========================================================
(function () {
  const MAX_SIDE = 3000;
  const QUALITY = 0.85;
  const SMALL_ENOUGH = 1.5 * 1024 * 1024; // abaixo disso nem mexe

  const originalFetch = window.fetch.bind(window);

  async function compress(file) {
    if (!(file instanceof File) || !file.type.startsWith("image/")) return file;
    if (file.size <= SMALL_ENOUGH) return file;

    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
      if (bitmap.close) bitmap.close();

      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", QUALITY));
      if (!blob || blob.size >= file.size) return file;

      const name = file.name.replace(/\.[^./]+$/, "") + ".jpg";
      return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
    } catch {
      return file; // se não der pra reduzir, manda a original
    }
  }

  window.fetch = async function (input, init) {
    const body = init && init.body;
    if (!(body instanceof FormData)) return originalFetch(input, init);

    const entries = [...body.entries()];
    const files = entries.filter(([, v]) => v instanceof File);
    if (files.length === 0) return originalFetch(input, init);

    const others = entries.filter(([, v]) => !(v instanceof File));
    const url = typeof input === "string" ? input : input.url;

    // pasta inteira: uma foto por pedido
    if (files.length > 1 && /\/folders\/\d+\/upload/.test(url)) {
      const allNodes = [];

      for (const [key, file] of files) {
        const form = new FormData();
        others.forEach(([k, v]) => form.append(k, v));
        form.append(key, await compress(file));

        const res = await originalFetch(input, { ...init, body: form });
        if (!res.ok) return res;

        const data = await res.clone().json().catch(() => null);
        if (data && Array.isArray(data.nodes)) allNodes.push(...data.nodes);
      }

      return new Response(JSON.stringify({ nodes: allNodes }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // uma foto só (ou capa): só reduz
    const form = new FormData();
    for (const [k, v] of entries) {
      form.append(k, v instanceof File ? await compress(v) : v);
    }
    return originalFetch(input, { ...init, body: form });
  };
})();
