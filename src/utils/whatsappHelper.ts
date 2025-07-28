import axios from 'axios'

const WA_URL = `https://graph.facebook.com/v23.0/654446084427127/messages`
const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer EAARt5paboZC8BPDbqIjocLuI5fEcQJI3ngJ1ZAZCRIVz8ZAEbscplO114MZB76jIfWV79pjLxw4cwNLN0y22Br4qZCLCvNj37bnZAPdcwY8lT2SphYkqzH1anHiQ5yhboAxt5aWlUX7mZCMdM0ZBcYl9WS4yeZC9QmppLnf4GFfqir7LsV9XhDZBJvcpslHKRmgF2ddZAzQbMDRUC603QSPjSkm1KLZB1Ej4EltUnPuXOVyzc`,
}

export async function sendText(to: string, text: string) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text, preview_url: false },
  }
  await axios.post(WA_URL, payload, { headers: HEADERS })
}

export async function sendList(
  to: string,
  header: string,
  body: string,
  footer: string,
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: header },
      body: { text: body },
      footer: { text: footer },
      action: { button: 'Ver opciones', sections }
    }
  }
  await axios.post(WA_URL, payload, { headers: HEADERS })
}