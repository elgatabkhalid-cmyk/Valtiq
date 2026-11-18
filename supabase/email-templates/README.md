# Plantillas de email de VALTIQ (Supabase Auth)

Cada plantilla contiene los tres idiomas. El email sale en el idioma guardado en la cuenta del usuario
(`user_metadata.lang`, que la app guarda al registrarse y cada vez que el usuario cambia de idioma).
Sin idioma guardado, sale en francés (idioma oficial del sitio).

Dónde pegarlas: Supabase → **Authentication → Emails → Templates**. En cada pestaña, sustituye el
**Subject** y el **Message body** (pestaña *Source*) por lo siguiente y pulsa **Save**.

| Pestaña de Supabase | Subject | Archivo para el Message body |
| --- | --- | --- |
| Confirm signup | `Confirmez votre compte VALTIQ` | `confirmar-cuenta.html` |
| Reset password | `Réinitialisez votre mot de passe VALTIQ` | `restablecer-contrasena.html` |
| Change email address | `Confirmez votre nouvel email VALTIQ` | `cambio-email.html` |

Las pestañas *Magic link*, *Invite user* y *Reauthentication* no se usan en VALTIQ: no hace falta tocarlas.

El asunto es el mismo para todos los idiomas, porque Supabase no permite condicionarlo al idioma del usuario: está en francés, idioma oficial del sitio.

Variables que usan las plantillas: `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`,
`{{ .Data.full_name }}` y `{{ .Data.lang }}`. Probadas con el motor de plantillas de Go (html/template y text/template)
en español, francés, inglés y sin idioma guardado.
