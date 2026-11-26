import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { huella } from "./clasificar.ts";
import { ofertaDeWoo } from "./ofertas.ts";
import { nombreYFormato, productoDeShopify, type ProductoShopify } from "./shopify.ts";

const productos = (JSON.parse(readFileSync(new URL("./fixtures/shopify-products.json", import.meta.url), "utf8")) as { products: ProductoShopify[] }).products;
const porTitulo = (t: string) => productos.find((p) => p.title === t)!;
const BASE = "https://tienda.example/";

describe("Shopify: /products.json", () => {
  it("nombre sin envase ni campaña, y el formato aparte", () => {
    expect(nombreYFormato("Crianza 2022 (Caja de 6 botellas)")).toEqual({ nombre: "Crianza 2022", formato: "Caja de 6 botellas" });
    expect(nombreYFormato("Castillo Ygay 2012 | Caja madera 1 botella 0.75L · Catálogo Navidad")).toEqual({ nombre: "Castillo Ygay 2012", formato: "Caja madera 1 botella 0.75L" });
    expect(nombreYFormato("Marqués del Atrio Crianza - Caja de 6 botellas de 75cl")).toEqual({ nombre: "Marqués del Atrio Crianza", formato: "Caja de 6 botellas de 75cl" });
    expect(nombreYFormato("Pazo Barrantes<br> Gran Vino ALBARIÑO| Caja madera Botella Magnum (1,5l)").nombre).toBe("Pazo Barrantes Gran Vino ALBARIÑO");
    expect(nombreYFormato("Marqués de Murrieta<br>Gran Reserva 2016").nombre).toBe("Marqués de Murrieta Gran Reserva 2016");
    // Un guion que no va seguido de un envase es parte del nombre.
    expect(nombreYFormato("Zarcillos de Ju - Vino dulce")).toEqual({ nombre: "Zarcillos de Ju - Vino dulce", formato: null });
  });

  it("vino en caja de 6: permalink, precio en céntimos, formato y unidades en la oferta", () => {
    const m = productoDeShopify(porTitulo("Crianza 2022 (Caja de 6 botellas)"), BASE)!;
    expect(m.clase).toBe("vino");
    expect(m.producto.name).toBe("Crianza 2022");
    expect(m.producto.permalink).toMatch(/^https:\/\/tienda\.example\/products\/[\w-]+$/);
    expect(m.producto.prices).toMatchObject({ price: "4950", currency_minor_unit: 2 });
    expect(m.categorias).toEqual(["vino", "Vino Tinto"]);
    expect(ofertaDeWoo(m.producto, m.gtin)).toMatchObject({ precio: 49.5, unidades: 6, disponible: true });
  });

  it("tienda en /es/: el permalink conserva el prefijo de idioma", () => {
    expect(productoDeShopify(porTitulo("MAZUELO"), "https://totomarques.com/es/")!.producto.permalink).toBe(`https://totomarques.com/es/products/${porTitulo("MAZUELO").handle}`);
  });

  it("experiencias a servicios; reventa, alimentación, lotes, ERP y productos a 0 € fuera", () => {
    expect(productoDeShopify(porTitulo("Visita a la Bodega"), BASE)?.clase).toBe("enoturismo");
    for (const t of ["Caja Combinada Tintos (6 botellas)", "Fruta Leche Tropical", "VINO INCUNABLE RIOJA TEMPR. BT3/4X6", "Descubre Marqués del Atrio"]) {
      expect(productoDeShopify(porTitulo(t), BASE), t).toBeNull();
    }
    for (const p of productos.filter((x) => x.product_type === "CHAMPAGNE")) expect(productoDeShopify(p, BASE), p.title).toBeNull();
    const surtido = { ...porTitulo("MAZUELO"), title: "Viña Arnaiz Crianza/Reserva/Roble" };
    expect(productoDeShopify(surtido, BASE)).toBeNull();
    expect(productoDeShopify({ ...porTitulo("MAZUELO"), title: "Señorío de los Llanos/Pata Negra Cepas Viejas/Reservado" }, BASE)).toBeNull();
    expect(productoDeShopify({ ...porTitulo("MAZUELO"), title: "Sidra Palacio Riaño" }, BASE)).toBeNull();
  });

  it("sin tipo de producto, lo que pasa los filtros cuenta como vino", () => {
    expect(productoDeShopify({ ...porTitulo("MAZUELO"), product_type: "" }, BASE)!.categorias).toContain("Vino");
    expect(productoDeShopify({ ...porTitulo("MAZUELO"), product_type: "Pack" }, BASE)!.categorias).not.toContain("Vino");
  });

  it("una caja de 6 de un solo vino sigue siendo ese vino aunque la tienda la llame «Pack»", () => {
    const m = productoDeShopify(porTitulo("Conde Del Pazo Albariño - Caja de 6 botellas de 75cl"), BASE)!;
    expect(m.producto.name).toBe("Conde Del Pazo Albariño");
    expect(m.categorias).toContain("DO Rias Baixas");
    expect(ofertaDeWoo(m.producto, null)).toMatchObject({ unidades: 6, formato_ml: 750 });
  });

  it("huella: idioma de la portada", () => {
    expect(huella('<html class="js" lang="ca"><script src="https://cdn.shopify.com/x.js"></script>', "https://x.cat").idioma).toBe("ca");
    expect(huella('<html lang="es-ES">', "https://x.es").idioma).toBe("es-es");
    expect(huella("<html>", "https://x.es").idioma).toBeNull();
  });
});
