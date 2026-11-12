import { describe, expect, it } from "vitest";
import adaptador from "./sierracantabria.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador sierracantabria.com (dominio de un grupo)", () => {
  const paganos = "https://sierracantabria.com/bodegas/vinedos-de-paganos/el-puntido-gran-reserva/";
  const sierra = "https://sierracantabria.com/bodegas/sierra-cantabria/reserva/";
  const prueba = {
    web: "https://sierracantabria.com/",
    paginas: { [paganos]: fixture("sierracantabria-el-puntido.html"), [sierra]: fixture("sierracantabria-reserva.html") },
    // En la BD el dominio solo está en Viñedos de Paganos.
    bodegas: [{ id: "paganos", nombre: "Viñedos de Paganos", municipio: null }],
  };

  it("cada vino va a la bodega de su ruta: el de Páganos es propio; el de Sierra Cantabria, de otra bodega del grupo (revisión)", async () => {
    const r = await rastrearCon(adaptador, prueba);
    const porNombre = Object.fromEntries(r.vinos.map((v) => [v.nombre, v]));
    expect(porNombre["El Puntido Gran Reserva"]).toMatchObject({ tipo: "tinto", crianza: "gran_reserva", bodega_marca: { estado: "propia", bodega: "Viñedos de Páganos" } });
    expect(porNombre["Sierra Cantabria Reserva"]).toMatchObject({ tipo: "tinto", crianza: "reserva", bodega_marca: { estado: "otra", bodega: "Bodegas Sierra Cantabria" } });
    expect(porNombre["El Puntido Gran Reserva"]!.denominacion?.denominacion?.slug).toBe("rioja");
  });

  it("una ruta de bodega desconocida queda «dudosa» (a revisión), nunca asignada a la bodega del sitio", async () => {
    const otra = "https://sierracantabria.com/bodegas/otra-bodega/reserva/";
    const r = await rastrearCon(adaptador, { ...prueba, paginas: { [otra]: fixture("sierracantabria-reserva.html") } });
    expect(r.vinos[0]!.bodega_marca).toEqual({ estado: "dudosa", bodega: null });
  });

  it("sin el adaptador no sale ningún vino (h1 sin espacios y sin ficha técnica)", async () => {
    const r = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(r.vinos).toHaveLength(0);
  });
});
