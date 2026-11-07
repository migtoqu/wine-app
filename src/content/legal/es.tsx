import type { LegalContent } from "./types";

// TODO(legal): completar los datos del titular antes de abrir al público y revisar con asesoría legal.
const OWNER = "[TODO: nombre o razón social del titular]";
const OWNER_ID = "[TODO: NIF/CIF]";
const OWNER_ADDRESS = "[TODO: domicilio]";
const CONTACT_EMAIL = "[TODO: email de contacto]";

const es: LegalContent = {
  lastUpdated: "2026-11-07",
  privacy: (
    <>
      <p>
        En esta política explicamos qué datos personales tratamos en wine-app, para qué y cuáles son
        tus derechos, de acuerdo con el Reglamento General de Protección de Datos (RGPD) y la Ley
        Orgánica 3/2018 (LOPDGDD).
      </p>
      <h2>Responsable del tratamiento</h2>
      <ul>
        <li>Titular: {OWNER}</li>
        <li>NIF: {OWNER_ID}</li>
        <li>Domicilio: {OWNER_ADDRESS}</li>
        <li>Contacto: {CONTACT_EMAIL}</li>
      </ul>
      <h2>Qué datos tratamos</h2>
      <ul>
        <li>Datos de cuenta: email y contraseña (guardada cifrada, nunca en claro).</li>
        <li>Declaración de mayoría de edad al entrar y al registrarte. No pedimos tu fecha de nacimiento.</li>
        <li>Preferencias: idioma, tema y gustos de vino que decidas indicar.</li>
        <li>Contenido personal: favoritos, notas, listas, diario de catas y cava.</li>
        <li>Datos técnicos mínimos necesarios para la seguridad del servicio (por ejemplo, registros de acceso).</li>
      </ul>
      <h2>Para qué y con qué base legal</h2>
      <ul>
        <li>Prestarte el servicio y gestionar tu cuenta: ejecución del contrato (art. 6.1.b RGPD).</li>
        <li>Mantener la seguridad y prevenir abusos: interés legítimo (art. 6.1.f RGPD).</li>
        <li>Cumplir obligaciones legales, como la restricción de acceso a menores: obligación legal (art. 6.1.c RGPD).</li>
      </ul>
      <p>No vendemos tus datos ni los usamos para publicidad personalizada.</p>
      <h2>Durante cuánto tiempo</h2>
      <p>
        Conservamos tus datos mientras tengas una cuenta activa. Si la borras, eliminamos tus datos
        personales, salvo los que debamos conservar por obligación legal durante los plazos exigidos.
      </p>
      <h2>Encargados del tratamiento</h2>
      <ul>
        <li>Supabase (base de datos y autenticación), con datos alojados en la Unión Europea.</li>
        <li>
          Vercel (alojamiento web). Puede tratar datos técnicos fuera del Espacio Económico Europeo con
          las garantías adecuadas (cláusulas contractuales tipo de la Comisión Europea).
        </li>
      </ul>
      <h2>Tus derechos</h2>
      <p>
        Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación del
        tratamiento y portabilidad escribiendo a {CONTACT_EMAIL}. También podrás exportar y borrar tu
        cuenta desde los ajustes. Si consideras que no hemos atendido bien tu solicitud, puedes
        reclamar ante la Agencia Española de Protección de Datos (
        <a href="https://www.aepd.es" rel="noopener noreferrer">aepd.es</a>).
      </p>
      <h2>Menores de edad</h2>
      <p>wine-app está dirigida exclusivamente a personas mayores de 18 años.</p>
    </>
  ),
  cookies: (
    <>
      <p>
        wine-app solo usa cookies técnicas, imprescindibles para que la web funcione o para recordar
        decisiones que tú tomas. No usamos cookies de análisis, publicidad ni de terceros. Por eso,
        según el artículo 22.2 de la Ley 34/2002 (LSSI) y la guía de la AEPD, no necesitan tu
        consentimiento, pero te informamos de ellas.
      </p>
      <h2>Cookies que usamos</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Finalidad</th>
            <th scope="col">Duración</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>sb-…-auth-token</code></td>
            <td>Mantener tu sesión iniciada de forma segura (Supabase).</td>
            <td>Hasta cerrar sesión o caducar la sesión</td>
          </tr>
          <tr>
            <td><code>age_ok</code></td>
            <td>Recordar que has confirmado ser mayor de 18 años.</td>
            <td>1 año</td>
          </tr>
          <tr>
            <td><code>NEXT_LOCALE</code></td>
            <td>Recordar el idioma que has elegido.</td>
            <td>1 año</td>
          </tr>
          <tr>
            <td><code>theme</code></td>
            <td>Recordar el tema (claro, oscuro o sistema).</td>
            <td>1 año</td>
          </tr>
        </tbody>
      </table>
      <p>Todas son cookies propias y no se usan para seguirte en otras webs.</p>
      <h2>Cómo eliminarlas</h2>
      <p>
        Puedes borrar o bloquear las cookies desde la configuración de tu navegador. Si bloqueas las
        cookies técnicas, es posible que no puedas iniciar sesión o que la web te vuelva a preguntar
        tu edad en cada visita.
      </p>
      <p>Si en el futuro usamos otro tipo de cookies, te pediremos permiso antes y actualizaremos esta política.</p>
    </>
  ),
  legalNotice: (
    <>
      <h2>Datos identificativos</h2>
      <p>
        En cumplimiento del artículo 10 de la Ley 34/2002, de servicios de la sociedad de la
        información y de comercio electrónico (LSSI), se informa de que esta web pertenece a:
      </p>
      <ul>
        <li>Titular: {OWNER}</li>
        <li>NIF: {OWNER_ID}</li>
        <li>Domicilio: {OWNER_ADDRESS}</li>
        <li>Email: {CONTACT_EMAIL}</li>
        <li>[TODO: datos de inscripción registral, si procede]</li>
      </ul>
      <h2>Objeto</h2>
      <p>
        wine-app es un servicio informativo para descubrir vinos y bodegas españolas. No vende vino
        ni gestiona reservas ni pagos: los enlaces a tiendas y bodegas llevan a webs de terceros.
      </p>
      <h2>Condiciones de uso</h2>
      <p>
        El acceso está reservado a personas mayores de 18 años. Durante la fase privada, el registro
        solo es posible por invitación. Te comprometes a hacer un uso lícito del servicio y a no
        intentar acceder a datos de otras personas.
      </p>
      <h2>Información sobre precios y productos</h2>
      <p>
        Los precios, disponibilidad y datos de vinos y bodegas proceden de fuentes públicas y pueden
        no estar actualizados. El precio válido es siempre el que indique la tienda en el momento de
        la compra.
      </p>
      <h2>Propiedad intelectual</h2>
      <p>
        El diseño y el código de wine-app pertenecen a su titular. Las marcas, nombres comerciales e
        imágenes de vinos, bodegas y tiendas pertenecen a sus respectivos propietarios y se muestran
        con fines informativos.
      </p>
      <h2>Responsabilidad y enlaces</h2>
      <p>
        No nos hacemos responsables del contenido de las webs de terceros enlazadas. Si detectas un
        enlace o dato incorrecto, escríbenos a {CONTACT_EMAIL}.
      </p>
      <h2>Consumo responsable</h2>
      <p>Disfruta del vino con moderación. Prohibida la venta y el consumo de alcohol a menores de 18 años.</p>
      <h2>Legislación aplicable</h2>
      <p>Estas condiciones se rigen por la legislación española.</p>
    </>
  ),
};

export default es;
