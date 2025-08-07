import { Request, Response } from 'express'
import fs from 'fs'
import Menu from '../models/Menu'
import Platillos from '../models/Platillos'
import Pedido from '../models/Pedido'
import PedidoItem from '../models/PedidoItem'
import Usuario from '../models/Usuarios'
import { sendText, sendButtons, sendList } from '../utils/whatsappHelper'

type Step =
  | 'WELCOME'
  | 'MAIN_MENU'
  | 'SELECT_CATEGORY'
  | 'SELECT_DISH'
  | 'ASK_QUANTITY'
  | 'ADD_MORE'
  | 'CONFIRM'

interface Session {
  step: Step
  categoryId?: number
  dishId?: number
  items: { dishId: number; name: string; price: number; quantity: number }[]
}

const sessions = new Map<string, Session>()
const VERIFY_TOKEN = 'EAARt5paboZC8BPDbqIjocLuI5fEcQJI3ngJ1ZAZCRIVz8ZAEbscplO114MZB76jIfWV79pjLxw4cwNLN0y22Br4qZCLCvNj37bnZAPdcwY8lT2SphYkqzH1anHiQ5yhboAxt5aWlUX7mZCMdM0ZBcYl9WS4yeZC9QmppLnf4GFfqir7LsV9XhDZBJvcpslHKRmgF2ddZAzQbMDRUC603QSPjSkm1KLZB1Ej4EltUnPuXOVyzc'

export class MenuController {
  // GET  /webhook → verificación de Meta
  static verify = (req: Request, res: Response) => {
    const token     = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge'] as string
    if (token === VERIFY_TOKEN) {
      res.status(200).send(challenge)
    } else {
      res.status(403).send('Token inválido')
    }
    return
  }

  // POST /webhook → flujo conversacional WhatsApp
  static webhook = async (req: Request, res: Response) => {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value
    const msg   = entry?.messages?.[0]

    // Siempre respondemos 200 aunque no haya mensaje
    if (!msg) {
      res.sendStatus(200)
      return
    }

    // Aquí sí tomamos el remitente real:
    const from    = msg.from!
    const textRaw = msg.text?.body?.trim() || ''
    const text    = textRaw.toLowerCase()

    // Logging
    fs.appendFileSync('wa_debug.log', `${new Date().toISOString()} ${from}: ${textRaw}\n`)

    // Recuperar o iniciar sesión
    let session = sessions.get(from)
    if (!session) {
      session = { step: 'WELCOME', items: [] }
      sessions.set(from, session)
    }

    try {
      switch (session.step) {

        // —Paso 1: mostrar menú principal—
        case 'WELCOME':
          await sendButtons(
            from,
            '🍽️ ¡Bienvenido a Restaurante X! ¿Qué deseas hacer hoy?',
            [
              { id: 'VIEW_MENU',  title: 'Ver menú'  },
              { id: 'VIEW_OFFERS', title: 'Ofertas'   },
              { id: 'HELP',        title: 'Ayuda'     }
            ]
          )
          session.step = 'MAIN_MENU'
          break

        // —Paso 2: manejar botón—
        case 'MAIN_MENU':
          if (msg.type === 'interactive' && msg.interactive.type === 'button_reply') {
            const btn = msg.interactive.button_reply.id
            if (btn === 'VIEW_MENU') {
              // Enviar lista de categorías
              const cats = await Menu.findAll()
              const sections = [{
                title: 'Categorías',
                rows: cats.map(c => ({
                  id:   `CAT_${c.id}`,
                  title: c.nombre
                }))
              }]
              await sendList(
                from,
                '📋 Menú del día',
                'Selecciona una categoría:',
                'Usa el selector arriba',
                sections
              )
              session.step = 'SELECT_CATEGORY'

            } else if (btn === 'VIEW_OFFERS') {
              await sendText(
                from,
                '💸 Ofertas del día:\n– 2x1 en aguas frescas\n– 10% de descuento\n\nPara volver escribe "hola".'
              )
              session.step = 'WELCOME'

            } else {
              await sendText(from, 'Escribe "hola" para comenzar.')
              session.step = 'WELCOME'
            }
          }
          break

        // —Paso 3: categoría elegida—
        case 'SELECT_CATEGORY':
          if (msg.type === 'interactive' && msg.interactive.type === 'list_reply') {
            session.categoryId = parseInt(
              msg.interactive.list_reply.id.replace('CAT_', ''), 10
            )
            const dishes = await Platillos.findAll({ where: { menuId: session.categoryId } })
            const listStr = dishes.map((d, i) =>
              `${i+1}) ${d.platillo} ($${d.precio})`
            ).join('\n')
            await sendText(
              from,
              `🍴 Platillos:\n${listStr}\n\nEnvía el número de tu elección.`
            )
            session.step = 'SELECT_DISH'
          }
          break

        // —Paso 4: platillo por número—
        case 'SELECT_DISH': {
          const idx = parseInt(text, 10) - 1
          const dishes = await Platillos.findAll({ where: { menuId: session.categoryId } })
          if (isNaN(idx) || idx < 0 || idx >= dishes.length) {
            await sendText(from, `⚠️ Ingresa un número entre 1 y ${dishes.length}.`)
            break
          }
          session.dishId = dishes[idx].id
          await sendText(
            from,
            `¿Cuántas unidades de "${dishes[idx].platillo}" deseas?`
          )
          session.step = 'ASK_QUANTITY'
          break
        }

        // —Paso 5: capturar cantidad—
        case 'ASK_QUANTITY': {
          const qty = parseInt(text, 10)
          if (isNaN(qty) || qty < 1) {
            await sendText(from, '⚠️ Cantidad inválida. Envía un número mayor que 0.')
            break
          }
          const dish = await Platillos.findByPk(session.dishId!)
          session.items.push({
            dishId:   dish!.id,
            name:     dish!.platillo,
            price:    dish!.precio,
            quantity: qty
          })
          await sendText(
            from,
            `✅ Agregado ${qty} x ${dish!.platillo}.\n¿Deseas agregar otro platillo? (sí/no)`
          )
          session.step = 'ADD_MORE'
          break
        }

        // —Paso 6: decidir seguir o confirmar—
        case 'ADD_MORE':
          if (text.startsWith('s')) {
            // vuelve a categoría inmediatamente
            const cats = await Menu.findAll()
            const sections = [{
              title: 'Categorías',
              rows: cats.map(c => ({
                id:   `CAT_${c.id}`,
                title: c.nombre
              }))
            }]
            await sendList(
              from,
              '📋 Menú del día',
              'Selecciona una categoría:',
              'Usa el selector arriba',
              sections
            )
            session.step = 'SELECT_CATEGORY'
          } else {
            // muestro resumen y confirmo
            let resumen = '📝 Tu pedido:\n'
            let total  = 0
            session.items.forEach(i => {
              resumen += `- ${i.quantity} x ${i.name} ($${i.price * i.quantity})\n`
              total += i.price * i.quantity
            })
            resumen += `\nTotal: $${total}\n¿Confirmas tu pedido? (sí/no)`
            await sendText(from, resumen.trim())
            session.step = 'CONFIRM'
          }
          break

        // —Paso 7: guardar o cancelar—
        case 'CONFIRM':
          if (text.startsWith('s')) {
            const [user] = await Usuario.findOrCreate({ where: { telefono: from } })
            const total = session.items.reduce((a,i) => a + i.price * i.quantity, 0)
            const order = await Pedido.create({ usuarioId: user.id, total })
            for (const it of session.items) {
              await PedidoItem.create({
                pedidoId:   order.id,
                platilloId: it.dishId,
                cantidad:   it.quantity
              })
            }
            await sendText(
              from,
              `🎉 Pedido #${order.id} registrado. Total: $${total}\n¡Gracias!`
            )
            sessions.delete(from)
          } else {
            await sendText(from, '❌ Pedido cancelado. Escribe "hola" para reiniciar.')
            sessions.delete(from)
          }
          break
      }

    } catch (err) {
      console.error('Flow WA error:', err)
      await sendText(from, '⚠️ Algo salió mal, inténtalo más tarde.')
      sessions.delete(from)
    }

    // ACK siempre 200 a Meta
    res.sendStatus(200)
    return
  }
}
