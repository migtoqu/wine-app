// Vocabulario cerrado de la extracción: variedades (con los nombres de
// `variedades_uva`), descriptores de cata y maridajes. Lo que no está aquí no
// se extrae: así nunca se copia una frase de la web, solo se reconocen términos.
import { quitarTildes } from "../../lib/texto.ts";

/** Texto para buscar: sin tildes, minúsculas y espacios simples. */
export function plano(s: string): string {
  return quitarTildes(s).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
}

export interface Variedad {
  /** Nombre canónico (= `variedades_uva.nombre`). */
  nombre: string;
  color: "tinta" | "blanca";
  /** Formas en texto plano (sin tildes, minúsculas). */
  formas: string[];
}

// Las formas más largas primero dentro de cada variedad; en la búsqueda se ordenan todas por longitud
// para que «tempranillo blanco» no cuente como «tempranillo».
export const VARIEDADES: Variedad[] = [
  { nombre: "Tempranillo Blanco", color: "blanca", formas: ["tempranillo blanco"] },
  { nombre: "Tempranillo", color: "tinta", formas: ["tempranillo", "tinta del pais", "tinto del pais", "tinto fino", "tinta fina", "tinto pais", "cencibel", "tinta de toro"] },
  { nombre: "Garnacha Tintorera", color: "tinta", formas: ["garnacha tintorera"] },
  { nombre: "Garnacha Blanca", color: "blanca", formas: ["garnacha blanca"] },
  { nombre: "Garnacha Tinta", color: "tinta", formas: ["garnacha tinta", "garnacha"] },
  { nombre: "Cabernet Franc", color: "tinta", formas: ["cabernet franc"] },
  { nombre: "Cabernet Sauvignon", color: "tinta", formas: ["cabernet sauvignon", "cabernet-sauvignon", "cabernet"] },
  { nombre: "Merlot", color: "tinta", formas: ["merlot"] },
  { nombre: "Malbec", color: "tinta", formas: ["malbec"] },
  { nombre: "Syrah", color: "tinta", formas: ["syrah", "shiraz"] },
  { nombre: "Petit Verdot", color: "tinta", formas: ["petit verdot"] },
  { nombre: "Pinot Noir", color: "tinta", formas: ["pinot noir"] },
  { nombre: "Mazuela", color: "tinta", formas: ["mazuelo", "mazuela", "carinena"] },
  { nombre: "Graciano", color: "tinta", formas: ["graciano"] },
  { nombre: "Bobal", color: "tinta", formas: ["bobal"] },
  { nombre: "Mencía", color: "tinta", formas: ["mencia"] },
  { nombre: "Prieto Picudo", color: "tinta", formas: ["prieto picudo"] },
  { nombre: "Monastrell", color: "tinta", formas: ["monastrell"] },
  { nombre: "Albillo Mayor", color: "blanca", formas: ["albillo mayor", "albillo"] },
  { nombre: "Albillo Real", color: "blanca", formas: ["albillo real"] },
  { nombre: "Verdejo", color: "blanca", formas: ["verdejo"] },
  { nombre: "Macabeo", color: "blanca", formas: ["macabeo", "viura"] },
  { nombre: "Sauvignon Blanc", color: "blanca", formas: ["sauvignon blanc"] },
  { nombre: "Chardonnay", color: "blanca", formas: ["chardonnay"] },
  { nombre: "Godello", color: "blanca", formas: ["godello"] },
  { nombre: "Albariño", color: "blanca", formas: ["albarino"] },
  { nombre: "Viognier", color: "blanca", formas: ["viognier"] },
  { nombre: "Moscatel de Grano Menudo", color: "blanca", formas: ["moscatel de grano menudo", "moscatel"] },
];

export const FORMAS_VARIEDAD: { forma: string; variedad: Variedad }[] = VARIEDADES.flatMap((v) =>
  v.formas.map((forma) => ({ forma, variedad: v })),
).sort((a, b) => b.forma.length - a.forma.length);

/** Descriptor canónico → formas en texto plano. */
type Diccionario = Record<string, string[]>;

export const CATA_VISTA: Diccionario = {
  "rojo picota": ["rojo picota", "picota"],
  "rojo cereza": ["rojo cereza", "cereza"],
  "rojo rubí": ["rojo rubi", "rubi"],
  "granate": ["granate"],
  "ribete violáceo": ["ribete violaceo", "ribete violeta", "ribete morado", "borde violaceo", "violaceo", "violaceos", "amoratado", "morado"],
  "ribete teja": ["ribete teja", "ribete atejado", "teja", "atejado"],
  "capa alta": ["capa alta", "capa muy alta", "muy cubierto", "bien cubierto", "cubierto"],
  "capa media": ["capa media", "capa media-alta", "capa media alta"],
  "rojo intenso": ["rojo intenso"],
  "limpio y brillante": ["limpio y brillante", "brillante"],
  "amarillo pajizo": ["amarillo pajizo", "pajizo"],
  "amarillo dorado": ["amarillo dorado", "dorado"],
  "reflejos verdosos": ["reflejos verdosos", "matices verdosos", "verdoso"],
  "rosa frambuesa": ["rosa frambuesa", "frambuesa"],
  "rosa pálido": ["rosa palido", "piel de cebolla", "salmon"],
  "fresa": ["rosa fresa", "color fresa"],
};

export const CATA_NARIZ: Diccionario = {
  "frutos negros": ["frutos negros", "fruta negra", "frutas negras", "fruto negro", "zarzamora", "mora", "moras", "arandanos", "arandano", "casis", "grosella negra"],
  "frutos rojos": ["frutos rojos", "fruta roja", "frutas rojas", "fruto rojo", "fresa", "fresas", "frambuesa", "frambuesas", "grosella", "guinda", "guindas", "cereza", "cerezas"],
  "fruta madura": ["fruta madura", "frutos maduros", "fruta muy madura", "confitura", "compota", "mermelada", "fruta confitada"],
  "fruta fresca": ["fruta fresca", "frutas frescas"],
  "fruta blanca": ["fruta blanca", "frutas blancas", "manzana", "pera", "melocoton"],
  "fruta tropical": ["fruta tropical", "frutas tropicales", "pina", "mango", "maracuya"],
  "cítricos": ["citricos", "citrico", "limon", "pomelo", "piel de naranja"],
  "flores": ["floral", "florales", "flores", "violeta", "violetas", "rosas", "flor blanca", "flores blancas"],
  "especias": ["especias", "especiado", "especiados", "especiada", "pimienta", "clavo", "nuez moscada", "canela"],
  "balsámicos": ["balsamico", "balsamicos", "balsamica", "eucalipto", "mentolado", "menta"],
  "regaliz": ["regaliz"],
  "vainilla": ["vainilla", "vainillas"],
  "tostados": ["tostados", "tostado", "torrefacto", "torrefactos", "torrefactado", "torrefactadas", "torrefactados", "ahumado", "ahumados"],
  "cacao": ["cacao", "chocolate"],
  "café": ["cafe"],
  "roble": ["roble", "madera fina", "notas de madera", "maderas nobles"],
  "monte bajo": ["monte bajo", "sotobosque", "sotobosques", "jara", "tomillo", "romero", "hierbas aromaticas", "hierbas"],
  "mineral": ["mineral", "minerales", "grafito", "tiza", "piedra", "terroso", "telurico"],
  "cuero": ["cuero"],
  "lácticos": ["lacticos", "lactico", "lacteas", "lacteos"],
  "frutos secos": ["frutos secos", "almendra", "avellana"],
  "bollería": ["bolleria", "pan tostado", "levaduras", "brioche"],
  "hinojo": ["hinojo", "anis"],
};

export const CATA_BOCA: Diccionario = {
  "taninos pulidos": ["taninos pulidos", "tanino pulido", "taninos redondos", "tanino redondo", "taninos dulces", "tanino dulce", "taninos maduros", "tanino maduro", "tanino armonioso", "taninos amables"],
  "taninos firmes": ["taninos firmes", "tanino firme", "taninos marcados", "tanino marcado", "taninos potentes"],
  "taninos sedosos": ["taninos sedosos", "tanino sedoso", "sedoso", "sedosa", "aterciopelado", "aterciopelada"],
  "estructurado": ["estructurado", "estructurada", "buena estructura", "gran estructura", "con estructura"],
  "equilibrado": ["equilibrado", "equilibrada", "equilibrio"],
  "untuoso": ["untuoso", "untuosa", "graso", "glicerico"],
  "carnoso": ["carnoso", "carnosa"],
  "fresco": ["fresco", "fresca", "frescura", "buena acidez", "acidez viva", "acidez fresca"],
  "elegante": ["elegante", "elegancia"],
  "potente": ["potente", "potencia"],
  "amplio": ["amplio", "amplia", "paso amplio"],
  "redondo": ["redondo", "redonda"],
  "sabroso": ["sabroso", "sabrosa"],
  "final largo": ["final largo", "largo final", "postgusto largo", "postgusto persistente", "persistente", "persistencia", "largo"],
  "afrutado": ["afrutado", "afrutada", "frutal"],
};

export const MARIDAJE: Diccionario = {
  "lechazo asado": ["lechazo asado", "lechazo", "cordero asado", "cordero lechal", "asado de cordero"],
  "cordero": ["cordero"],
  "cochinillo": ["cochinillo", "toston"],
  "carnes rojas": ["carnes rojas", "carne roja", "chuleton", "solomillo", "entrecot", "vacuno", "buey", "ternera"],
  "carnes blancas": ["carnes blancas", "carne blanca", "pollo", "pavo", "cerdo", "aves"],
  "carnes a la brasa": ["a la brasa", "parrilla", "barbacoa", "brasa"],
  "asados": ["asados", "asado"],
  "guisos": ["guisos", "guiso", "estofados", "estofado", "cocido", "potaje", "legumbres"],
  "caza": ["caza", "venado", "ciervo", "jabali", "perdiz", "codorniz"],
  "embutidos": ["embutidos", "embutido", "jamon iberico", "jamon", "chorizo", "morcilla", "iberico", "ibericos"],
  "quesos curados": ["quesos curados", "queso curado", "quesos fuertes", "quesos azules"],
  "quesos": ["quesos", "queso"],
  "pescados": ["pescados", "pescado", "pescado azul", "bacalao", "atun", "salmon", "rape"],
  "mariscos": ["mariscos", "marisco", "crustaceos", "moluscos"],
  "arroces": ["arroces", "arroz", "paella"],
  "pasta": ["pasta", "pastas", "risotto"],
  "setas": ["setas", "boletus", "hongos", "trufa"],
  "verduras": ["verduras", "verdura", "ensaladas", "ensalada", "hortalizas"],
  "aperitivos": ["aperitivos", "aperitivo", "tapas", "entrantes"],
  "postres": ["postres", "postre", "chocolate negro", "reposteria"],
  "cocina asiática": ["cocina asiatica", "sushi", "cocina japonesa"],
};

/**
 * Descriptores canónicos que aparecen en un texto. Cada forma se busca como palabra completa y se
 * «consume» para que una forma corta («cereza») no vuelva a contar dentro de una larga ya hallada.
 */
export function descriptores(texto: string, dic: Diccionario, max = 6): string[] {
  let t = ` ${plano(texto).replace(/[^a-z0-9ñ ]+/g, " ")} `;
  const formas = Object.entries(dic)
    .flatMap(([canon, fs]) => fs.map((f) => ({ canon, f })))
    .sort((a, b) => b.f.length - a.f.length);
  const hallados: { canon: string; pos: number }[] = [];
  for (const { canon, f } of formas) {
    const aguja = ` ${f} `;
    const pos = t.indexOf(aguja);
    if (pos < 0) continue;
    if (!hallados.some((h) => h.canon === canon)) hallados.push({ canon, pos });
    t = t.split(aguja).join(" ".repeat(aguja.length - 1) + " ");
  }
  return hallados.sort((a, b) => a.pos - b.pos).slice(0, max).map((h) => h.canon);
}

/** Idiomas de visitas → ISO 639-1. */
export const IDIOMAS: Record<string, string> = {
  espanol: "es", castellano: "es", spanish: "es", ingles: "en", english: "en", frances: "fr", french: "fr",
  aleman: "de", german: "de", italiano: "it", italian: "it", portugues: "pt", portuguese: "pt",
  chino: "zh", chinese: "zh", japones: "ja", ruso: "ru", neerlandes: "nl", holandes: "nl",
};

/** Plataformas de reserva habituales (la URL de reserva puede estar fuera del sitio). */
export const PLATAFORMAS_RESERVA = [
  "turitop.com", "bookitit.com", "fareharbor.com", "checkfront.com", "regiondo.", "civitatis.com", "eventbrite.",
  "covermanager.com", "entradium.com", "winerist.com", "wineandtours", "bodeboca.com/experiencias", "bookeo.com",
  "peek.com", "tickentradas", "ticketea", "reservas.", "booking.", "simplybook", "calendly.com", "koobin",
  "experiences.", "wine-tourism", "bokun.io", "rezdy.com", "getyourguide.", "tiqets.com",
];
