import axios from 'axios'

const WA_URL  = `https://graph.facebook.com/v23.0/654446084427127/messages`
const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer EAARt5paboZC8BPDbqIjocLuI5fEcQJI3ngJ1ZAZCRIVz8ZAEbscplO114MZB76jIfWV79pjLxw4cwNLN0y22Br4qZCLCvNj37bnZAPdcwY8lT2SphYkqzH1anHiQ5yhboAxt5aWlUX7mZCMdM0ZBcYl9WS4yeZC9QmppLnf4GFfqir7LsV9XhDZBJvcpslHKRmgF2ddZAzQbMDRUC603QSPjSkm1KLZB1Ej4EltUnPuXOVyzc`,
}

/**
 * Envío de texto simple con markdown + emojis
 */
export async function sendText(to: string, text: string) {
  const payload = {
    messaging_product: 'whatsapp',
    to:'526182113919',
    type: 'text',
    text: { body: text, preview_url: false },
  }
  await axios.post(WA_URL, payload, { headers: HEADERS })
}

/**
 * Envío de un mensaje de botones de respuesta rápida
 */
export async function sendButtons(
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[]
) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map(b => ({
          type: 'reply',
          reply: { id: b.id, title: b.title }
        }))
      }
    }
  }
  await axios.post(WA_URL, payload, { headers: HEADERS })
}

/**
 * Envío de una lista con secciones (ideal para catálogo o menú largo)
 */
export async function sendList(
  to: string,
  headerText: string,
  bodyText: string,
  footerText: string,
  sections: {
    title: string
    rows: { id: string; title: string; description?: string }[]
  }[]
) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: headerText },
      body:   { text: bodyText },
      footer: { text: footerText },
      action: { button: '📋 Ver opciones', sections }
    }
  }
  await axios.post(WA_URL, payload, { headers: HEADERS })
}
