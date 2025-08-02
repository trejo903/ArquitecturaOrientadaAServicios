import axios from 'axios'

const WA_URL = `https://graph.facebook.com/v23.0/654446084427127/messages`
const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer EAARt5paboZC8BPNhbqZCHIPrZAIItzL4FEyEAXYL0x8R0aEOoD8G7i8tLs5YBrUz6O1iGM0vmw10cUuhYQu0SlAFE5xAPNsmoda8fmkHapO8yFZA4JqNUrSts0UDyBNCDd9yWZAUfJOKFAnwtfAUCSkJllgmZCqRgLS5x3jUGfnlZBZCM4gdjDRPv7VLJ88smCuLHdAGtK7ukTBl1uXzKt8P1ExvSFxCwMJ9gruw0dufCpaO3ipTxXr3zSkvl37ylAZDZD`,
}

//prueba

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