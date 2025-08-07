import { Request, Response } from 'express'
import fs from 'fs'
import Menu from '../models/Menu'
import Platillos from '../models/Platillos'
import Pedido from '../models/Pedido'
import PedidoItem from '../models/PedidoItem'
import Usuario from '../models/Usuarios'
import { sendText, sendButtons, sendList } from '../utils/whatsappHelper'

type Session = {
  step: 'welcome' | 'main_menu' | 'select_category' | 'select_dish' | 'qty' | 'confirm'
  categoryId?: number
  dishId?: number
  items: { dishId: number; name: string; price: number; quantity: number }[]
}

const sessions = new Map<string, Session>()
const VERIFY_TOKEN = 'EAARt5paboZC8BPDbqIjocLuI5fEcQJI3ngJ1ZAZCRIVz8ZAEbscplO114MZB76jIfWV79pjLxw4cwNLN0y22Br4qZCLCvNj37bnZAPdcwY8lT2SphYkqzH1anHiQ5yhboAxt5aWlUX7mZCMdM0ZBcYl9WS4yeZC9QmppLnf4GFfqir7LsV9XhDZBJvcpslHKRmgF2ddZAzQbMDRUC603QSPjSkm1KLZB1Ej4EltUnPuXOVyzc'

export class MenuController {
  // GET /webhook → verificación con Meta
  static verify = (req: Request, res: Response) => {
    const hubToken     = req.query['hub.verify_token']
    const hubChallenge = req.query['hub.challenge'] as string
    if (hubToken === VERIFY_TOKEN) {
      res.status(200).send(hubChallenge)
      return
    }
    res.status(403).send('Token inválido')
    return
  }

  // POST /webhook → flujo conversacional
  static webhook = async (req: Request, res: Response) => {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value
    const msg   = entry?.messages?.[0]
    if (!msg) {
      res.sendStatus(200)
      return
    }

    // toma el número del remitente automáticamente
    const from    = '526182113919'
    const textRaw = msg.text?.body?.trim() || ''
    const text    = textRaw.toLowerCase()

    fs.appendFileSync('wa_debug.log', `${new Date().toISOString()} ${from}: ${textRaw}\n`)

    // sesión
    let session = sessions.get(from)
    if (!session) {
      session = { step: 'welcome', items: [] }
      sessions.set(from, session)
    }

    try {
      switch (session.step) {
        case 'welcome':
          await sendButtons(
            from,
            '¡Bienvenido a Restaurante X! ¿Qué deseas hacer hoy?',
            [
              { id: 'VIEW_MENU',  title: 'Ver menú' },
              { id: 'VIEW_OFFERS', title: 'Ofertas' },
              { id: 'HELP',       title: 'Ayuda' }
            ]
          )
          session.step = 'main_menu'
          break

        case 'main_menu':
          if (msg.type === 'interactive' && msg.interactive.type === 'button_reply') {
            const btn = msg.interactive.button_reply.id
            if (btn === 'VIEW_MENU') {
              // lista de categorías
              const cats = await Menu.findAll()
              const sections = [
                {
                  title: 'Categorías',
                  rows: cats.map(c => ({
                    id:   `CAT_${c.id}`,
                    title: c.nombre
                  }))
                }
              ]
              await sendList(
                from,
                'Menú del día',
                'Selecciona una categoría:',
                'Usa arriba el selector',
                sections
              )
              session.step = 'select_category'

            } else if (btn === 'VIEW_OFFERS') {
              await sendText(
                from,
                'Ofertas del día:\n– Promo 1\n– Promo 2\n\nPara volver escribe "hola".'
              )
              session.step = 'welcome'

            } else {
              await sendText(from, 'Escribe "hola" para comenzar.')
              session.step = 'welcome'
            }
          }
          break

        case 'select_category':
          if (msg.type === 'interactive' && msg.interactive.type === 'list_reply') {
            const catId = parseInt(msg.interactive.list_reply.id.replace('CAT_', ''), 10)
            session.categoryId = catId

            const dishes = await Platillos.findAll({ where: { menuId: catId } })
            const listTxt = dishes.map((d, i) => `${i+1}) ${d.platillo} ($${d.precio})`).join('\n')
            await sendText(from, `Platillos:\n${listTxt}\n\nEnvía el número elegido.`)
            session.step = 'select_dish'
          }
          break

        case 'select_dish': {
          const idx = parseInt(text, 10) - 1
          const dishes = await Platillos.findAll({ where: { menuId: session.categoryId } })
          if (isNaN(idx) || idx < 0 || idx >= dishes.length) {
            await sendText(from, `Ingresa un número entre 1 y ${dishes.length}.`)
            break
          }
          session.dishId = dishes[idx].id
          await sendText(from, `¿Cuántas unidades de "${dishes[idx].platillo}"?`)
          session.step = 'qty'
          break
        }

        case 'qty': {
          const qty = parseInt(text, 10)
          if (isNaN(qty) || qty < 1) {
            await sendText(from, 'Cantidad inválida. Ingresa un número mayor que 0.')
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
            `Agregado ${qty} x ${dish!.platillo}.\n¿Deseas otro platillo? (sí/no)`
          )
          session.step = 'confirm'
          break
        }

        case 'confirm':
          if (text.startsWith('s')) {
            const [user] = await Usuario.findOrCreate({ where: { telefono: from }})
            const total = session.items.reduce((a,i) => a + i.price * i.quantity, 0)
            const order = await Pedido.create({ usuarioId: user.id, total })
            for (const i of session.items) {
              await PedidoItem.create({
                pedidoId:   order.id,
                platilloId: i.dishId,
                cantidad:   i.quantity
              })
            }
            await sendText(
              from,
              `✅ Pedido #${order.id} registrado con total $${total}.\n¡Gracias!`
            )
            sessions.delete(from)

          } else {
            await sendText(from, '❌ Pedido cancelado. Escribe "hola" para reiniciar.')
            sessions.delete(from)
          }
          break
      }
    } catch (err) {
      console.error('Error WA flow:', err)
      await sendText(from, '⚠️ Algo salió mal, inténtalo más tarde.')
      sessions.delete(from)
    }

    res.sendStatus(200)
    return
  }
}
