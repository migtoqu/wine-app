import { describe, expect, it } from "vitest";
import {
  archivoValido, atribucion, emparejarCategoria, esCategoriaDeBodega, nombreDeCategoria, ordenarArchivos, parsearArchivo, parsearCategoria,
  type BodegaRef,
} from "./commons.ts";

const archivo = `<html><body><div class="fullMedia"><a href="https://upload.wikimedia.org/wikipedia/commons/9/9e/Haro_-_Bodegas_Muga_01.jpg?utm_source=x">orig</a></div>
<div class="mw-filepage-other-resolutions"><a href="https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9e/Haro_-_Bodegas_Muga_01.jpg/1280px-Haro_-_Bodegas_Muga_01.jpg?utm_source=x">1280</a></div>
<span class="fileInfo">(2,048 × 1,536 pixels, file size: 344 KB, MIME type: image/jpeg)</span>
<table><tr><td id="fileinfotpl_aut">Author</td><td>Zarateman</td></tr></table>
<span class="licensetpl_short">CC0</span><span class="licensetpl_link">http://creativecommons.org/publicdomain/zero/1.0/deed.en</span></body></html>`;

describe("wikimedia commons", () => {
  it("lee licencia, autor, tamaño y la miniatura de 1280 px sin seguimiento", () => {
    const f = parsearArchivo(archivo, "File:Haro - Bodegas Muga 01.jpg");
    expect(f).toMatchObject({ autor: "Zarateman", licencia: "CC0", ancho: 2048, alto: 1536 });
    expect(f.imagen).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Haro_-_Bodegas_Muga_01.jpg/1280px-Haro_-_Bodegas_Muga_01.jpg");
    expect(archivoValido(f)).toBeNull();
    expect(atribucion(f)).toMatch(/^Zarateman · CC0 · Wikimedia Commons · https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  });

  it("licencias no libres o sin autor, fuera", () => {
    const f = parsearArchivo(archivo.replace(">CC0<", ">GFDL<"), "File:x.jpg");
    expect(archivoValido(f)).toMatch(/licencia no libre/);
    const sinAutor = parsearArchivo(archivo.replace(">CC0<", ">CC BY-SA 4.0<").replace("Zarateman", ""), "File:x.jpg");
    expect(archivoValido(sinAutor)).toBe("sin autor");
  });

  it("empareja por nombre y provincia de la ruta; una sola candidata", () => {
    const muga: BodegaRef = { id: "1", nombre: "Bodegas Muga", provincia: "La Rioja", municipio: "Haro" };
    const otra: BodegaRef = { id: "2", nombre: "Muga", provincia: "Valladolid", municipio: null };
    const porClave = new Map([["muga", [muga, otra]]]);
    expect(nombreDeCategoria("Category:CVNE, Haro")).toBe("CVNE");
    expect(emparejarCategoria("Category:Bodegas Muga", ["Category:Wineries in La Rioja (Spain)"], porClave)).toBe(muga);
    expect(emparejarCategoria("Category:Bodegas Muga", [], porClave)).toBeNull();
    expect(esCategoriaDeBodega("Category:Logos of wineries in Spain")).toBe(false);
  });

  it("archivos: fuera corchos, botellas, maquetas y logos; primero los que dicen bodega", () => {
    const a = (t: string) => ({ titulo: `File:${t}`, url: "" });
    const orden = ordenarArchivos([a("Cork of 2015 Riscal.jpg"), a("Portia Model.jpg"), a("Wine bottle.jpg"), a("Calle.jpg"), a("Bodegas X fachada.jpg"), a("Logo.svg")]);
    expect(orden.map((x) => x.titulo)).toEqual(["File:Bodegas X fachada.jpg", "File:Calle.jpg"]);
  });

  it("subcategorías y archivos de una página de categoría", () => {
    const html = `<div id="mw-subcategories"><a href="/wiki/Category:Bodegas_Muga">Bodegas Muga</a></div><div id="mw-category-media"><a href="/wiki/File:Haro_-_Bodegas_Muga_01.jpg">f</a></div>`;
    expect(parsearCategoria(html)).toMatchObject({ subcategorias: [{ titulo: "Category:Bodegas Muga" }], archivos: [{ titulo: "File:Haro - Bodegas Muga 01.jpg" }] });
  });
});
