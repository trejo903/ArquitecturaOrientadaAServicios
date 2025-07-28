import axios from 'axios'

const WA_URL = `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_ID}/messages`
const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
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