import axios from 'axios'

const WA_URL  = 'https://graph.facebook.com/v23.0/654446084427127/messages'
const HEADERS = {
  'Content-Type': 'application/json',
  Authorization:  `Bearer EAARt5paboZC8BPDbqIjocLuI5fEcQJI3ngJ1ZAZCRIVz8ZAEbscplO114MZB76jIfWV79pjLxw4cwNLN0y22Br4qZCLCvNj37bnZAPdcwY8lT2SphYkqzH1anHiQ5yhboAxt5aWlUX7mZCMdM0ZBcYl9WS4yeZC9QmppLnf4GFfqir7LsV9XhDZBJvcpslHKRmgF2ddZAzQbMDRUC603QSPjSkm1KLZB1Ej4EltUnPuXOVyzc`
}

// texto libre
export async function sendText(to: string, body: string) {
  const payload = {
    messaging_product: 'whatsapp',
    to:'526182113919',
    type: 'text',
    text: { body, preview_url: false }
  }
  await axios.post(WA_URL, payload, { headers: HEADERS })
}

// botones rápidos (sin Markdown en body)
export async function sendButtons(
  to: string,
  text: string,
  buttons: { id: string; title: string }[]
) {
  const interactive = {
    type: 'button',
    body:   { text },
    action: {
      buttons: buttons.map(b => ({
        type: 'reply',
        reply: { id: b.id, title: b.title }
      }))
    }
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive
  }
  await axios.post(WA_URL, payload, { headers: HEADERS })
}

// lista interactiva (sin Markdown en header/body/footer)
export async function sendList(
  to: string,
  header: string,
  body:   string,
  footer: string,
  sections: {
    title: string
    rows: { id: string; title: string; description?: string }[]
  }[]
) {
  const interactive = {
    type:   'list',
    header: { type: 'text', text: header },
    body:   { text: body },
    footer: { text: footer },
    action: { button: 'Ver opciones', sections }
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive
  }
  await axios.post(WA_URL, payload, { headers: HEADERS })
}
