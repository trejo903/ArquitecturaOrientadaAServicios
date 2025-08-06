import axios from 'axios'

const WA_URL = `https://graph.facebook.com/v23.0/654446084427127/messages`
const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer EAARt5paboZC8BPEYfuUn82oKM73gsZBl9smvuKWyjmPGRapCR64bZAaSmaKnqi6qCz8n9WZAe9aGR1yeb6dCQYnPrZCngaBwlYIajwyGKLl6ltRKJFVmwB0vcEZAqNOLr5JtqjxIHfnvnH0LQ7qN4C9oPGhmWnH3wrZAxPmHZBzZCOd6KZCmwRI6xCq3X6Ib6ijE5Xk7qbl6a86prRlhMZB1vePiLKxxu0ZBuoqbcFVenQnZAFgrnw2Y4ybxiazfltty2mAZDZD`,
}

//prueba

export async function sendText(to: string, text: string) {
  const payload = {
    messaging_product: 'whatsapp',
    to:"526182113919",
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