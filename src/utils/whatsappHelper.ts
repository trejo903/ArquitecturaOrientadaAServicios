import axios from 'axios'

const WA_URL = `https://graph.facebook.com/v23.0/654446084427127/messages`
const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer EAARt5paboZC8BPNZCZCKosHfIMfO8X3LM8a9ZCNtTYv8ZA8Xp2RzwVNTTQcIyRut0kzonLW1SBqKS6S1cnpxNzaULCl8bZCTfSsx4di0RFoHGvKmK5cgfZBWwvdHkYzqbQI1i7FUlZBt35Gp6YPWzxCWIMtl1wFeIiDNdsZBnFNTZA4Dp4PUApcS4b6LWAiiqXztyLaopPtZBr8fVjnZCWZBUt15zEg5fhwgxTXMeoD0BiuRhutS9sRp0QaHp5ITOOAKF84oZD`,
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