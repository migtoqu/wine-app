// Diccionario de referencia: define la forma de todos los demás (ver en.ts).
// Para textos con variables usa funciones: greeting: (name: string) => `Hola, ${name}`.
const es = {
  meta: {
    title: "wine-app",
    description:
      "Descubre vinos y bodegas de España: dónde comprarlos, a qué precio, enoturismo y premios.",
  },
  common: {
    skipToContent: "Saltar al contenido",
    homeLabel: "wine-app, ir al inicio",
    comingSoon: "Próximamente",
  },
  theme: {
    label: "Tema",
    light: "Claro",
    dark: "Oscuro",
    system: "Sistema",
  },
  language: {
    label: "Idioma",
    switchTo: "Read in English",
    short: "EN",
  },
  footer: {
    responsible:
      "Disfruta del vino con moderación. Prohibida la venta y el consumo de alcohol a menores de 18 años.",
    legalNav: "Información legal",
    privacy: "Privacidad",
    cookies: "Cookies",
    legalNotice: "Aviso legal",
    privateBeta: "Fase privada por invitación",
  },
  ageGate: {
    title: "Antes de entrar",
    question: "¿Eres mayor de 18 años?",
    text: "Esta web trata sobre bebidas alcohólicas y solo está destinada a personas mayores de edad.",
    yes: "Sí, soy mayor de 18",
    no: "No",
    deniedTitle: "Lo sentimos",
    deniedText:
      "Debes ser mayor de edad para acceder a esta web. Vuelve cuando cumplas 18 años.",
    back: "Volver",
    cookieNotice:
      "Solo usamos cookies técnicas, necesarias para que la web funcione (sesión, idioma, tema y esta verificación).",
    cookieLink: "Más información sobre cookies",
  },
  landing: {
    eyebrow: "Acceso solo por invitación",
    title: "Vinos y bodegas de España, en un solo sitio",
    subtitle:
      "Encuentra dónde comprar cada vino y a qué precio, descubre bodegas para visitar y guarda tus favoritos, notas y catas.",
    ctaLogin: "Iniciar sesión",
    ctaInvite: "Tengo una invitación",
    featuresTitle: "Qué podrás hacer",
    features: [
      {
        badge: "Vinos",
        title: "Compara precios",
        text: "Añadas, formatos y tiendas que venden en España, con su historial de precios.",
      },
      {
        badge: "Bodegas",
        title: "Planea visitas",
        text: "Fichas de bodega con sus vinos, premios y enoturismo.",
      },
      {
        badge: "Tu espacio",
        title: "Lleva tu cuaderno",
        text: "Favoritos, notas de cata, listas y tu cava personal.",
      },
    ],
  },
  login: {
    title: "Iniciar sesión",
    text: "El acceso con cuenta llegará muy pronto. De momento la web está en fase privada.",
    back: "Volver al inicio",
  },
  notFound: {
    title: "Página no encontrada",
    text: "La página que buscas no existe o se ha movido.",
    back: "Volver al inicio",
  },
  legal: {
    lastUpdated: "Última actualización",
    privacyTitle: "Política de privacidad",
    cookiesTitle: "Política de cookies",
    legalNoticeTitle: "Aviso legal",
  },
};

export default es;
export type Dictionary = typeof es;
