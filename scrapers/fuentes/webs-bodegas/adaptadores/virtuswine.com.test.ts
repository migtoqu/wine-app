import { describe, expect, it } from "vitest";
import adaptador from "./virtuswine.com.ts";
import { rastrearCon } from "./prueba.ts";

const O = "https://www.virtuswine.com";
const producto = (slug: string, name: string, extra = "") => ({
  id: slug.length, name, permalink: `${O}/producto/${slug}/`, categories: [],
  description: `<p>Vino tinto. Uva: 100% Tempranillo. Crianza de 14 meses en barrica de roble francés. Grado alcohólico 14,5% vol. ${extra}</p>`,
});

describe("adaptador virtuswine.com", () => {
  const seo = `<html><head><title>Descubre el Exquisito Vino de Aldeyuso en Virtus Wine 2024</title></head><body class="single-post"><main><h1>Descubre el Exquisito Vino de Aldeyuso en Virtus Wine</h1>
    <p>Nuestros vinos de uva Albillo Mayor y Tempranillo pasan por barrica. Notas de cata: fruta madura en nariz. Cosecha 2021.</p></main></body></html>`;
  const prueba = {
    web: `${O}/`,
    paginas: {
      [`${O}/`]: `<html><head><title>Virtus Wine</title><meta name="generator" content="WordPress 6.6"><link rel="https://api.w.org/" href="${O}/wp-json/"><link rel="stylesheet" href="${O}/wp-content/plugins/woocommerce/assets/css/woocommerce.css"></head><body><main><p>Bodega en Aldeyuso.</p><a href="${O}/aviso-legal/">Aviso legal</a><a href="${O}/vino-de-aldeyuso/">Aldeyuso</a></main></body></html>`,
      [`${O}/vino-de-aldeyuso/`]: seo,
      [`${O}/wp-json/wc/store/v1/products?per_page=100&page=1`]: JSON.stringify([
        producto("el-sueco-2021", "El Sueco 2021"),
        producto("el-sueco-2021-copia", "El Sueco 2021 (copia)"),
        producto("virtus-2019-ribera-del-duero", "Virtus 2019"),
        producto("pack-caja-madera", "Pack Caja Madera"),
      ]),
    },
  };

  it("solo los productos: ni entradas SEO ni el duplicado «(copia)» ni los packs", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.vinos.map((v) => [v.nombre, v.anio]).sort()).toEqual([["El Sueco", 2021], ["Virtus", 2019]]);
  });

  it("sin el adaptador, la entrada SEO sale como vino", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.some((v) => /aldeyuso/i.test(v.nombre))).toBe(true);
  });
});
