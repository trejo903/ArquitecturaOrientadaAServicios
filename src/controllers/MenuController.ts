import { Request, Response } from 'express'
import fs from 'fs'
import Menu from '../models/Menu'
import Platillos from '../models/Platillos'
import Pedido from '../models/Pedido'
import PedidoItem from '../models/PedidoItem'
import Usuario from '../models/Usuarios'
import { sendText, sendButtons, sendList } from '../utils/whatsappHelper'

type Session = {
  step: 'welcome' | 'main_menu' | 'select_category' | 'select_dish' | 'qty' | 'confirm';
  categoryId?: number;
  dishId?: number;
  items: { dishId: number; name: string; price: number; quantity: number }[];
}

const sessions = new Map<string, Session>()

export class MenuController {
  // GET /webhook → verificación de Meta
  static verify = (req: Request, res: Response) => {
    const VERIFY_TOKEN   = 'EAARt5paboZC8BPDbqIjocLuI5fEcQJI3ngJ1ZAZCRIVz8ZAEbscplO114MZB76jIfWV79pjLxw4cwNLN0y22Br4qZCLCvNj37bnZAPdcwY8lT2SphYkqzH1anHiQ5yhboAxt5aWlUX7mZCMdM0ZBcYl9WS4yeZC9QmppLnf4GFfqir7LsV9XhDZBJvcpslHKRmgF2ddZAzQbMDRUC603QSPjSkm1KLZB1Ej4EltUnPuXOVyzc'
    const hubToken       = req.query['hub.verify_token']
    const hubChallenge   = req.query['hub.challenge'] as string

    if (hubToken === VERIFY_TOKEN) {
      res.status(200).send(hubChallenge)
      return
    }
    res.status(403).send('🛑 Token incorrecto')
    return
  }

  // POST /webhook → flujo de conversación
  static webhook = async (req: Request, res: Response) => {
    const entry   = req.body.entry?.[0]?.changes?.[0]?.value
    const msg     = entry?.messages?.[0]
    if (!msg) {
      res.sendStatus(200)  // siempre OK
      return
    }

    const from    = msg.from!
    const textRaw = msg.text?.body?.trim() || ''
    const text    = textRaw.toLowerCase()

    // Log para debugging
    fs.appendFileSync('wa_debug.log', `${new Date().toISOString()} ${from}: ${textRaw}\n`)

    // Crear o recuperar sesión
    let session = sessions.get(from)
    if (!session) {
      session = { step: 'welcome', items: [] }
      sessions.set(from, session)
    }

    try {
      switch (session.step) {
        // —— Paso 1: saludo y menu principal con botones ——  
        case 'welcome':
          await sendButtons(
            from,
            '🍽️ *¡Bienvenido a Restaurante X!* \n¿Qué deseas hacer hoy?',
            [
              { id: 'VIEW_MENU',  title: '📋 Ver menú' },
              { id: 'VIEW_OFFERS', title: '💰 Ofertas' },
              { id: 'HELP',       title: '❓ Ayuda' }
            ]
          )
          session.step = 'main_menu'
          break

        // —— Paso 2: manejar respuesta de botón ——  
        case 'main_menu':
          if (msg.type === 'interactive' && msg.interactive.type === 'button_reply') {
            const btnId = msg.interactive.button_reply.id
            if (btnId === 'VIEW_MENU') {
              // construye lista de categorías
              const cats = await Menu.findAll()
              const sections = [{
                title: 'Categorías disponibles',
                rows: cats.map(c => ({
                  id:   `CAT_${c.id}`,
                  title: c.nombre
                }))
              }]
              await sendList(
                from,
                '🍽️ *Menú del día*',
                'Selecciona una categoría:',
                'Use el selector arriba',
                sections
              )
              session.step = 'select_category'

            } else if (btnId === 'VIEW_OFFERS') {
              // aquí enviarías la plantilla de ofertas… (similar a la de menú)
              await sendText(from, '💸 *Ofertas del día:* \n– Promo 1\n– Promo 2\n\nVuelve al menú con *Hola*.')
              session.step = 'welcome'

            } else {
              await sendText(from, '🤖 Para soporte escribe *hola* de nuevo.')
              session.step = 'welcome'
            }
          }
          break

        // —— Paso 3: usuario selecciona categoría de la lista ——  
        case 'select_category':
          if (msg.type === 'interactive' && msg.interactive.type === 'list_reply') {
            const selected = msg.interactive.list_reply.id
            const catId = parseInt(selected.replace('CAT_', ''), 10)
            session.categoryId = catId

            const dishes = await Platillos.findAll({ where: { menuId: catId } })
            const pl = dishes.map((d, i) => `${i + 1}) ${d.platillo} ($${d.precio})`).join('\n')
            await sendText(from, `🍴 *Platillos de la categoría:* \n${pl}\n\nEscribe el número de tu elección.`)

            session.step = 'select_dish'
          }
          break

        // —— Paso 4: usuario elige platillo por texto ——  
        case 'select_dish': {
          const num = parseInt(text, 10)
          const dishes = await Platillos.findAll({ where: { menuId: session.categoryId } })
          if (isNaN(num) || num < 1 || num > dishes.length) {
            await sendText(from, `⚠️ Elige un número válido entre 1 y ${dishes.length}.`)
            break
          }
          const chosen = dishes[num - 1]
          session.dishId = chosen.id
          await sendText(from, `¿Cuántas unidades de *${chosen.platillo}* deseas?`)
          session.step = 'qty'
          break
        }

        // —— Paso 5: cantidad ——  
        case 'qty': {
          const qty = parseInt(text, 10)
          if (isNaN(qty) || qty < 1) {
            await sendText(from, '⚠️ Ingresa una cantidad válida (entero mayor que 0).')
            break
          }
          const dish = await Platillos.findByPk(session.dishId!)
          session.items.push({
            dishId: dish!.id,
            name:   dish!.platillo,
            price:  dish!.precio,
            quantity: qty
          })
          await sendText(from,
            `✅ Agregado *${qty} x ${dish!.platillo}*.\n` +
            `¿Quieres agregar otro platillo? _sí_ / _no_`
          )
          session.step = 'confirm'
          break
        }

        // —— Paso 6: confirmar o seguir agregando ——  
        case 'confirm':
          if (text.startsWith('s')) {
            // guardar en BD
            const [user] = await Usuario.findOrCreate({ where: { telefono: from }})
            const total = session.items.reduce((a, i) => a + i.price * i.quantity, 0)
            const order = await Pedido.create({ usuarioId: user.id, total })
            for (const i of session.items) {
              await PedidoItem.create({
                pedidoId:   order.id,
                platilloId: i.dishId,
                cantidad:   i.quantity
              })
            }
            await sendText(from,
              `🎉 ¡Listo! Tu pedido *#${order.id}* ha sido registrado.\n` +
              `Total: *$${total}*\n\n` +
              `¡Gracias por elegirnos!`
            )
            sessions.delete(from)

          } else {
            await sendText(from, '❌ Pedido cancelado. Escribe *hola* para comenzar de nuevo.')
            sessions.delete(from)
          }
          break
      }
    } catch (e) {
      console.error('🔥 Error en flujo WA', e)
      await sendText(from, '⚠️ Algo salió mal, intenta más tarde.')
      sessions.delete(from)
    }

    // Meta exige un 200 aunque haya fallos internos
    res.sendStatus(200)
    return
  }
}
