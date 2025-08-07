import axios from 'axios'

const apiVersion    = process.env.WHATSAPP_API_VERSION  || 'v23.0'
const phoneId       = process.env.WHATSAPP_PHONE_ID!
const accessToken   = process.env.WHATSAPP_TOKEN!

const BASE_URL = `https://graph.facebook.com/${apiVersion}/654446084427127/messages`
const HEADERS = {
  'Content-Type': 'application/json',
  Authorization:   `Bearer EAARt5paboZC8BPDbqIjocLuI5fEcQJI3ngJ1ZAZCRIVz8ZAEbscplO114MZB76jIfWV79pjLxw4cwNLN0y22Br4qZCLCvNj37bnZAPdcwY8lT2SphYkqzH1anHiQ5yhboAxt5aWlUX7mZCMdM0ZBcYl9WS4yeZC9QmppLnf4GFfqir7LsV9XhDZBJvcpslHKRmgF2ddZAzQbMDRUC603QSPjSkm1KLZB1Ej4EltUnPuXOVyzc`,
}

// Mensaje de texto puro
export async function sendText(to: string, body: string) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body, preview_url: false },
  }
  await axios.post(BASE_URL, payload, { headers: HEADERS })
}

// Botones rápidos (ideal para menú principal)
export async function sendButtons(to: string, text: string, buttons: { id: string; title: string }[]) {
  const interactive = {
    type: 'button',
    body:   { text },
    action: { buttons: buttons.map((b, i) => ({ type: 'reply', reply: { id: b.id, title: b.title } })) }
  }
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive
  }
  await axios.post(BASE_URL, payload, { headers: HEADERS })
}

// Lista interactiva (ideal para categorías)
export async function sendList(
  to: string,
  header: string,
  body:   string,
  footer: string,
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
) {
  const interactive = {
    type:    'list',
    header:  { type: 'text', text: header },
    body:    { text: body },
    footer:  { text: footer },
    action:  { button: 'Ver opciones', sections }
  }
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive
  }
  await axios.post(BASE_URL, payload, { headers: HEADERS })
}
