// Nombres reales de los consejos de Rioja y Navarra (2026-11-26).
import { describe, expect, it } from "vitest";
import { limpiarNombreVinoConsejo, separarAnada } from "./vinos.ts";

describe("nombres de vino de los consejos", () => {
  it.each([
    ["Homenaje Blanco D.O Navarra", "Homenaje Blanco"],
    ["Marco Real Pequeñas Producciones Sauvignon Blanc D.O Navarra", "Marco Real Pequeñas Producciones Sauvignon Blanc"],
    ["BERAMENDI ROBLE – 100% MERLOT", "Beramendi Roble"],
    ["BERAMENDI ENSAMBLAJE (80% TEMPRANILLO- 20% GRACIANO)", "Beramendi Ensamblaje"],
    ["Pagos de Obanos 100% Merlot Roble", "Pagos de Obanos Merlot Roble"],
    ["PALACIO DE SADA ROSADO GARNACHA", "Palacio de Sada Rosado Garnacha"],
    ["MARQUÉS DE MONTECIERZO – RESERVA", "Marqués de Montecierzo – Reserva"],
    ["Alma Bohemia De Altanza", "Alma Bohemia de Altanza"],
    ["Barranco Del Prado", "Barranco del Prado"],
    ["Viñedos De Sonsierra El Rincón De Los Galos - Viñedo Singular", "Viñedos de Sonsierra El Rincón de los Galos - Viñedo Singular"],
    ["Señorio De La Estrella Blanco", "Señorio de la Estrella Blanco"],
    ["GARNACHA LA CANTERA", "Garnacha La Cantera"],
    ["ROSADO DEL ALBA", "Rosado del Alba"],
    ["3FLORES CRIANZA", "3Flores Crianza"],
    ["Tarón 4m", "Tarón 4m"],
    ["Finca La Pared Syrah D.O Navarra", "Finca La Pared Syrah"],
    ["Cuna de Reyes la Rioja", "Cuna de Reyes La Rioja"],
    ["Izadi El Regalo \"viñedo Singular\"", "Izadi El Regalo Viñedo Singular"],
    ["Valdelacierva 5! Renques", "Valdelacierva 5 Renques"],
    ["Vino de Pago D.O. Prado de Irache", "Vino de Pago D.O. Prado de Irache"],
    ["De Nariz Tempranillo", "De Nariz Tempranillo"],
    ["F. Olimpia 1917 Reserva", "F. Olimpia 1917 Reserva"],
    ["XR", "XR"],
  ])("%s → %s", (n, esperado) => {
    expect(limpiarNombreVinoConsejo(n)).toBe(esperado);
  });

  it("la añada dentro del nombre tras «Añada» sale del nombre", () => {
    expect(separarAnada("J.cantera Brut Nature Gran Añada 2020 Rosé 100% Garnacha Edición Limitada", null))
      .toEqual({ nombre: "J.cantera Brut Nature Gran Añada Rosé Garnacha Edición Limitada", anio: 2020 });
    expect(separarAnada("1925 Laderas De San Quilez", null)).toEqual({ nombre: "1925 Laderas de San Quilez", anio: null });
    expect(separarAnada("Irujo Crianza 2018", null)).toEqual({ nombre: "Irujo Crianza", anio: 2018 });
  });
});
