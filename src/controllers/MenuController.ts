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
  // GET /webhook → verificación de Meta
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

    // ACK inmediato si no es mensaje
    if (!msg) {
      res.sendStatus(200)
      return
    }

    // remitente real
    const from    = msg.from!
    const raw     = msg.text?.body?.trim() || ''
    const text    = raw.toLowerCase()
    fs.appendFileSync('wa_debug.log', `${new Date().toISOString()} ${from}: ${raw}\n`)

    // recuperar / iniciar sesión
    let session = sessions.get(from)
    if (!session) {
      session = { step: 'WELCOME', items: [] }
      sessions.set(from, session)
    }

    try {
      switch (session.step) {

        // —— 1. Bienvenida con botones rápidos ——
        case 'WELCOME':
          await sendButtons(
            from,
            '🍽️ ¡Bienvenido a Restaurante X! ¿Qué deseas hacer hoy?',
            [
              { id: 'VIEW_MENU',  title: 'Ver menú' }
            ]
          )
          session.step = 'MAIN_MENU'
          break

        // —— 2. Manejar botón del menú principal ——
        case 'MAIN_MENU':
          if (msg.type === 'interactive' && msg.interactive.type === 'button_reply') {
            const btn = msg.interactive.button_reply.id
            if (btn === 'VIEW_MENU') {
              // 2.1 Enviar categorías como lista interactiva
              const cats = await Menu.findAll()
              const sections = [{
                title: 'Categorías',
                rows: cats.map(c => ({
                  id:    `CAT_${c.id}`,
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
              await sendText(from,
                '💸 Ofertas del día:\n– 2x1 en aguas frescas\n– 10% de descuento\n\nPara volver escribe "hola".'
              )
              session.step = 'WELCOME'

            } else {
              await sendText(from, 'Escribe "hola" para comenzar.')
              session.step = 'WELCOME'
            }
          }
          break

        // —— 3. Selección de categoría (lista) ——
        case 'SELECT_CATEGORY':
          if (msg.type === 'interactive' && msg.interactive.type === 'list_reply') {
            // extraer id de categoría
            session.categoryId = parseInt(
              msg.interactive.list_reply.id.replace('CAT_', ''), 10
            )
            // 3.1 enviar platillos de esa categoría como lista
            const platos = await Platillos.findAll({ where: { menuId: session.categoryId } })
            const sections = [{
              title: 'Platillos',
              rows: platos.map(p => ({
                id:    `DISH_${p.id}`,
                title: `${p.platillo} ($${p.precio})`
              }))
            }]
            await sendList(
              from,
              '🍴 Elige un platillo',
              `Categoría seleccionada: ${platos[0]?.menuId}`,
              '',
              sections
            )
            session.step = 'SELECT_DISH'
          }
          break

        // —— 4. Selección de platillo (lista) ——
        case 'SELECT_DISH':
          if (msg.type === 'interactive' && msg.interactive.type === 'list_reply') {
            session.dishId = parseInt(
              msg.interactive.list_reply.id.replace('DISH_', ''), 10
            )
            // 4.1 preguntar cantidad
            const elegido = await Platillos.findByPk(session.dishId!)
            await sendText(
              from,
              `¿Cuántas unidades de "${elegido!.platillo}" deseas?`
            )
            session.step = 'ASK_QUANTITY'
          }
          break

        // —— 5. Capturar cantidad ——
        case 'ASK_QUANTITY':
          {
            const qty = parseInt(text, 10)
            if (isNaN(qty) || qty < 1) {
              await sendText(from, '⚠️ Cantidad inválida. Ingresa un número mayor que 0.')
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
          }
          break

        // —— 6. ¿Agregar más o confirmar? ——
        case 'ADD_MORE':
          if (text.startsWith('s')) {
            // reabrir categorías (lista interactiva)
            const cats = await Menu.findAll()
            const sections = [{
              title: 'Categorías',
              rows: cats.map(c => ({
                id:    `CAT_${c.id}`,
                title: c.nombre
              }))
            }]
            await sendList(
              from,
              '📋 Menú del día',
              'Selecciona otra categoría:',
              'Usa el selector arriba',
              sections
            )
            session.step = 'SELECT_CATEGORY'
          } else {
            // mostrar resumen y pasar a confirmar
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

        // —— 7. Confirmar o cancelar ——
        case 'CONFIRM':
          if (text.startsWith('s')) {
            // persistir pedido
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
              `🎉 Pedido #${order.id} registrado con total $${total}.\n¡Gracias!`
            )
          } else {
            await sendText(from, '❌ Pedido cancelado. Escribe "hola" para reiniciar.')
          }
          sessions.delete(from)
          break
      }

    } catch (e) {
      console.error('Error en flujo WA:', e)
      await sendText(from, '⚠️ Algo salió mal, inténtalo más tarde.')
      sessions.delete(from)
    }

    // ACK 200 siempre
    res.sendStatus(200)
    return
  }
}
