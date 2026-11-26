// Casos reales del catálogo (2026-11-26): titulares que no son vinos y nombres con restos de SEO.
import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { esNombreDeVino, esTitularEditorial, nombreVino } from "./extraer.ts";
import { bloques } from "./html.ts";

describe("titulares que no son vinos", () => {
  it.each([
    "Cómo conservar el vino en casa sin bodega: consejos para pisos y apartamentos",
    "Vendimia nocturna: ¿por qué gusta a los enólogos?",
    "96 puntos para Elías Mora Reserva, 94 a Gran Elías Mora",
    "Verdejo: qué es, de dónde es y cómo reconocer un buen Verdejo de Rueda",
    "Descubre los Vinos de Bodega Numanthia",
    "Descubre nuestro vino tinto",
    "Nuestra Tienda",
    "Nuestro proceso artesanal de elaboración del vino",
    "Los mejores vinos de Bodegas y Viñedos Ilurce en la Denominación de Origen Rioja",
    "Sabores del Ebro: Vino y Picnic a orillas del río (80 €/persona",
    "Menu del Valle o Riojano Maridaje 1 Vino",
    "Cinco vinos ValSotillo, en el pódium de las mejores guías",
    "Decanter reconoce la excelencia de Valdemar en su Rioja Report",
    "Puntuaciones de Losada en La Semana Vitivinícola: 97·96·95 ptos",
    "Tipos de barrica de vino I La Viña del Abuelo",
    "Lo mejor de la Finca del Quiñón",
    "Tus mejores momentos con un vino Pariente",
    "Altos Inurrieta2014, premio al Mejor Vino de",
    "“Bodega Cuatro Rayas, 1935-. Una historia de cooperación y éxito”",
    "El vino ecológico de",
    "▷ Nuestros vinos Ilurce |Bodegas y Viñedos Ilurce",
    "Buenos vinos tintos calidad precio",
    "Protos verdejo precio",
  ])("%s", (t) => {
    expect(esTitularEditorial(t)).toBe(true);
    expect(nombreVino(t)).toBe("");
  });

  it.each(["Tienda Vinos", "Amador García Tienda", "Blog", "Lionel GOAT 10 – Sicilia Syrah IGT", "Iluminado Vinos de La Luz Malbec Paraje Altamira"])("no es un vino: %s", (n) => {
    expect(esNombreDeVino(nombreVino(n) || n)).toBe(false);
  });

  it.each([
    "Marqués de Reinosa Garnacha Tinta Colección Privada",
    "Castillo de Mendoza Gran Reserva – Edición Limitada – Colección Familiar",
    "Dominio de la Granadilla – Sauvignon Blanc",
    "Cava Conde de Haro Blanc de Blancs Millésimé",
    "El Guardián de la Viña",
    "La Loba",
    "Barón de Filar Crianza",
    "Cava Barón de Bermont",
    "Sancho Barón",
    "Que Vida Viura",
    "Para Muestra, un Botón Godello – Vino de Villa de Ponferrada",
    "Aníbal de Otero Vino de la Villa de Otero del Toral",
  ])("sigue siendo un vino: %s", (n) => {
    expect(esTitularEditorial(n)).toBe(false);
    expect(esNombreDeVino(nombreVino(n))).toBe(true);
  });
});

describe("nombres con restos de SEO", () => {
  it.each([
    ["Rioja Tinto Crianza Solar de Estraunza • precio 7,20€", "Rioja Tinto Crianza Solar de Estraunza"],
    ["Izadi Crianza . Vinos de Bodegas Izadi", "Izadi Crianza"],
    ["Flor de Vetus Verdejo . Vinos de Bodegas Vetus", "Flor de Vetus Verdejo"],
    ["JAUN DE ALZATE CRIANZA – Vino tinto", "Jaun De Alzate Crianza"],
    ["Arzobispo Diego de Tejada – Vino de autor", "Arzobispo Diego de Tejada"],
    ["Crianza Ramírez de la Piscina Selección (6 bot", "Crianza Ramírez de la Piscina Selección"],
    ["Tinto Joven Ramírez de la Piscina (12b", "Tinto Joven Ramírez de la Piscina"],
    ["12 x URBINA VIURA CRIANZA BODEGA RIOJA", "Urbina Viura Crianza"],
    ["José Pariente Verdejo , y", "José Pariente Verdejo"],
    ["Javier Sanz Semidulce , verdejo semidulce de Rueda", "Javier Sanz Semidulce"],
    ["Javier Sanz Verdejo en de", "Javier Sanz Verdejo"],
    ["Tinto Rioja VALENCISO: de", "Tinto Rioja VALENCISO"],
    ["Sine Die: Nuestro nuevo vino", "Sine Die"],
    ["LABRIT Blanco: el vino que reconecta pasado y presente", "LABRIT Blanco"],
    ["CUBANEGRA. Primer reserva de municipio de la D. O. Rioja", "Cubanegra"],
    ["Helena la Lía , Acacia. NUEVA AÑADA", "Helena la Lía Acacia"],
    ["Seda de Oro – Mejor tempranillo del mundo", "Seda de Oro"],
    ["Descubre el vino Clos Bartolomé de Celler Bartolomé", "Clos Bartolomé"],
    ["Escudero de Bocos \"VERDEJO BARRICA\". Vino blanco. de", "Escudero de Bocos VERDEJO BARRICA"],
    ["Javier Sanz Finca Saltamontes . Viñedo Prefiloxérico. Vino de Guarda", "Javier Sanz Finca Saltamontes"],
    ["Vino de Autor – M1 By Dani MABE", "M1 By Dani MABE"],
  ])("%s → %s", (t, n) => {
    expect(nombreVino(t)).toBe(n);
  });

  it.each([
    ["▷ Comprar Vino Gran Reserva", "Gran Reserva"],
    ["Tinto D.O. Toro Elías Mora Crianza", "Tinto D.O. Toro Elías Mora Crianza"],
    ["Tinto Cosecha", "Tinto Cosecha"],
    ["Alvia: Livius Rosado Gran Reserva", "Alvia Livius Rosado Gran Reserva"],
    ["Muedra , Gran Reserva", "Muedra Gran Reserva"],
    ["Carlomagno , 125 Aniversario", "Carlomagno 125 Aniversario"],
    ["VALENCISO Rosa , Vino de La Rioja", "VALENCISO Rosa"],
    ["Blanco de Rioja VALENCISO : Viura y Garnacha Blanca", "Blanco de Rioja VALENCISO"],
    ["Tinto Rioja VALENCISO 25 Aniversario: No es “otro vino”", "Tinto Rioja VALENCISO 25 Aniversario"],
    ["Crianza Edición Limitada: Selecto y Finito", "Crianza Edición Limitada"],
    ["Vall Por", "Vall Por"],
    ["Vinos-Paydos", "Paydos"],
    ["6 x URBINA GRAN RESERVA 2004 BODEGA RIOJA BODEGA RIOJA", "Urbina Gran Reserva"],
    ["Piérola Crianza | Vino Rioja Alavesa Tempranillo", "Piérola Crianza"],
  ])("sin regresiones: %s → %s", (t, n) => {
    expect(nombreVino(t)).toBe(n);
  });

  it.each(["Tintos de Rioja", "vino de Toro", "del Priorat", "Bar en Ollauri", "Concours Mondial de Bruxelles", "Todo empieza en el campo", "Elige Tus Favoritos", "Hechos Con Cariño", "Vino-rioja", "Blancos", "Sanz – Bodegueros desde 1870", "Taller de vendimia en familia", "Tokaj Aszú 5 Puttonyos (Vino Dulce"])("no es un vino: %s", (n) => {
    expect(esNombreDeVino(nombreVino(n) || n) && !!nombreVino(n)).toBe(false);
  });
});

describe("titulares animados letra a letra", () => {
  it("«E l P i j u s M a g n i f i c u s» → «El Pijus Magnificus»", () => {
    const html = `<main><h2 class="elementor-headline"> <span class="w"> <span>E</span> <span>l</span> </span> <span class="w"> <span>P</span> <span>i</span> <span>j</span> <span>u</span> <span>s</span> </span> <span class="w"> <span>M</span> <span>a</span> <span>g</span> <span>n</span> <span>i</span> <span>f</span> <span>i</span> <span>c</span> <span>u</span> <span>s</span> </span></h2><p>Texto.</p></main>`;
    expect(bloques(cheerio.load(html))[0]).toEqual({ tipo: "h2", texto: "El Pijus Magnificus" });
  });
});
