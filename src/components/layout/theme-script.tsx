import { AGE_COOKIE, THEME_COOKIE } from "@/lib/preferences";

// Se ejecuta en <head> antes del primer pintado (patrón "preventing flash before hydration" de Next):
// - data-theme-pref: preferencia guardada (light | dark | system).
// - data-theme: tema resuelto (light | dark), del que cuelgan los tokens de globals.css.
// - data-age-ok: oculta la puerta +18 si ya se verificó la edad.
// Lee cookies en el cliente para no usar cookies() en el servidor y mantener el prerender estático.
const script = `(function(){try{var d=document.documentElement;function g(n){var m=document.cookie.match(new RegExp("(?:^|; )"+n+"=([^;]*)"));return m?decodeURIComponent(m[1]):null}var p=g("${THEME_COOKIE}");if(p!=="light"&&p!=="dark")p="system";var q=matchMedia("(prefers-color-scheme: dark)");function a(){var v=d.getAttribute("data-theme-pref")||"system";d.setAttribute("data-theme",v==="system"?(q.matches?"dark":"light"):v)}d.setAttribute("data-theme-pref",p);a();q.addEventListener("change",a);if(g("${AGE_COOKIE}")==="1")d.setAttribute("data-age-ok","")}catch(e){}})()`;

// type text/plain en el cliente evita el aviso de React por renderizar <script> (patrón de la guía de Next);
// el script ya se ejecutó al parsear el HTML.
export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
