// whatsappHelper.ts
import axios from 'axios'

const WA_URL = `https://graph.facebook.com/v16.0/654446084427127/messages`
const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer EAARt5paboZC8BPDbqIjocLuI5fEcQJI3ngJ1ZAZCRIVz8ZAEbscplO114MZB76jIfWV79pjLxw4cwNLN0y22Br4qZCLCvNj37bnZAPdcwY8lT2SphYkqzH1anHiQ5yhboAxt5aWlUX7mZCMdM0ZBcYl9WS4yeZC9QmppLnf4GFfqir7LsV9XhDZBJvcpslHKRmgF2ddZAzQbMDRUC603QSPjSkm1KLZB1Ej4EltUnPuXOVyzc`,
}

/**
 * Envía una plantilla (template) aprobada por WhatsApp.
 * @param to Número de destino (en formato E.164, sin el '+')
 * @param templateName Nombre de la plantilla (tal cual aparece en tu panel)
 * @param languageCode Código de idioma (por ej. "es_MX")
 * @param components Array con los componentes de la plantilla (body, header, buttons…)
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components: any[] = []
) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: components, // por defecto vacío si no hay variables ni botones
    },
  }

  await axios.post(WA_URL, payload, { headers: HEADERS })
}
