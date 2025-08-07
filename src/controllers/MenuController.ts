import { Request, Response } from 'express'
import Menu         from '../models/Menu'
import Platillos    from '../models/Platillos'
import Pedido       from '../models/Pedido'
import PedidoItem   from '../models/PedidoItem'
import Usuario      from '../models/Usuarios'
import { sendText, sendButtons, sendList } from '../utils/whatsappHelper'

interface SessionData {
  paso: string
  items: { platilloId: number; nombre: string; precio: number; cantidad: number }[]
  categoriaId?: number
}

const sessions = new Map<string, SessionData>()
const verifyToken = 'EAARt5paboZC8BPDbqIjocLuI5fEcQJI3ngJ1ZAZCRIVz8ZAEbscplO114MZB76jIfWV79pjLxw4cwNLN0y22Br4qZCLCvNj37bnZAPdcwY8lT2SphYkqzH1anHiQ5yhboAxt5aWlUX7mZCMdM0ZBcYl9WS4yeZC9QmppLnf4GFfqir7LsV9XhDZBJvcpslHKRmgF2ddZAzQbMDRUC603QSPjSkm1KLZB1Ej4EltUnPuXOVyzc'

export class MenuController {
  /** GET /webhook */
  static verify = (req: Request, res: Response) => {
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (token === verifyToken) res.status(200).send(challenge as string)
    res.status(403).send('❌ Token inválido')
  }

  /** POST /webhook */
  static webhook = async (req: Request, res: Response) => {
    const entry   = req.body.entry?.[0]
    const change  = entry?.changes?.[0]
    const message = change?.value?.messages?.[0]
    if (!message) res.sendStatus(200)

    const from = message.from!
    const text = (message.text?.body || '').trim().toLowerCase()

    // iniciar o recuperar sesión
    let session = sessions.get(from)
    if (!session) {
      session = { paso: 'menu_inicio', items: [] }
      sessions.set(from, session)
    }

    try {
      switch (session.paso) {
        // --- MENÚ INICIAL con botones ---
        case 'menu_inicio':
          await sendText(from,
            '*🍽️ ¡Bienvenido a Restaurante X!*_\n' +
            '_¿Qué deseas hacer hoy?_\n\n' +
            'Usa los botones debajo ⬇️')
          await sendButtons(from, 'Elige una opción:',
            [
              { id: 'opt_menu',    title: '📋 Ver Menú'    },
              { id: 'opt_ofertas', title: '✨ Ofertas Día' },
              { id: 'opt_salir',   title: '🚪 Salir'       }
            ])
          session.paso = 'menu_seleccion'
          break

        // botón presionado
        case 'menu_seleccion':
          if (message.interactive?.button_reply) {
            const btn = message.interactive.button_reply.id
            if (btn === 'opt_menu') {
              session.paso = 'listar_categorias'
            }
            else if (btn === 'opt_ofertas') {
              // aquí puedes llamar a tu endpoint de ofertas
              await sendText(from, '🌟 ¡Estas son nuestras ofertas de hoy! ...')
              session.paso = 'menu_inicio'
            }
            else {
              await sendText(from, '👋 ¡Hasta luego!')
              sessions.delete(from)
              break
            }
          } else {
            await sendText(from, 'Por favor usa los botones ⬇️')
          }
          break

        // LISTAR CATEGORÍAS como LISTA INTERACTIVA
        case 'listar_categorias':
          {
            const categorias = await Menu.findAll()
            const sections = [{
              title: 'Categorías',
              rows: categorias.map((c,i) => ({
                id: `${c.id}`,
                title: c.nombre,
                description: ''
              }))
            }]
            await sendList(from,
              '📚 Nuestras categorías',
              'Selecciona con un solo tap:',
              'Puedes regresar al inicio en cualquier momento',
              sections)
            session.paso = 'escoger_categoria'
          }
          break

        // coger la categoría taponada
        case 'escoger_categoria':
          if (message.interactive?.list_reply) {
            const catId = Number(message.interactive.list_reply.id)
            session.categoriaId = catId
            session.paso = 'listar_platillos'
          } else {
            await sendText(from, '☝️ Toca uno de los elementos de la lista.')
          }
          break

        // listar platillos de esa categoría
        case 'listar_platillos':
          {
            const platillos = await Platillos.findAll({ where: { menuId: session.categoriaId }})
            let txt = `*🍽️ Platillos disponibles:*\n`
            platillos.forEach((p,i) => {
              txt += `\n${i+1}) *${p.platillo}* — $${p.precio}`
            })
            txt += `\n\n_Envía el número para elegirlo_`
            await sendText(from, txt)
            session.paso = 'esperando_num_platillo'
          }
          break

        // usuario escribe “1”, “2”, …
        case 'esperando_num_platillo':
          {
            const idx = parseInt(text) - 1
            const lista = await Platillos.findAll({ where: { menuId: session.categoriaId }})
            if (idx < 0 || idx >= lista.length) {
              await sendText(from, '❗ Elige un número válido.')
              break
            }
            session.items.push({
              platilloId: lista[idx].id,
              nombre: lista[idx].platillo,
              precio: lista[idx].precio,
              cantidad: 1
            })
            await sendText(from,
              `✅ *Agregado:* 1 x *${lista[idx].platillo}* — $${lista[idx].precio}\n` +
              `_¿Agregar más?_ (sí / no)`)
            session.paso = 'preguntar_mas'
          }
          break

        // decidir si agrega más
        case 'preguntar_mas':
          if (text.startsWith('s')) {
            session.paso = 'listar_categorias'  // vuelve al inicio lista categorías
          } else {
            // confirma y crea pedido
            let sum = 0
            let resumen = '*🧾 Resumen de tu pedido:*\n\n'
            session.items.forEach(i => {
              const sub = i.precio * i.cantidad
              resumen += `- ${i.cantidad} x ${i.nombre} — $${sub}\n`
              sum += sub
            })
            resumen += `\n*Total:* $${sum}`
            await sendText(from, resumen)
            await sendButtons(from, '¿Confirmas tu pedido?', [
              { id: 'confirm', title: '✔️ Sí, confirmar' },
              { id: 'cancel',  title: '❌ Cancelar'   }
            ])
            session.paso = 'finalizar'
          }
          break

        // confirmar o cancelar
        case 'finalizar':
          if (message.interactive?.button_reply) {
            if (message.interactive.button_reply.id === 'confirm') {
              const [u] = await Usuario.findOrCreate({ where: { telefono: from }})
              const pedido = await Pedido.create({
                usuarioId: u.id,
                total: session.items.reduce((a,i)=>a+i.precio*i.cantidad,0)
              })
              for (const it of session.items) {
                await PedidoItem.create({
                  pedidoId: pedido.id,
                  platilloId: it.platilloId,
                  cantidad: it.cantidad
                })
              }
              await sendText(from, `🎉 ¡Listo! Tu pedido #${pedido.id} está en camino.`)
            } else {
              await sendText(from, '❌ Pedido cancelado. Escribe “hola” para empezar de nuevo.')
            }
          }
          sessions.delete(from)
          break
      }
    }
    catch(err){
      console.error('Flow error:', err)
      await sendText(from, '⚠️ Algo salió mal, intenta más tarde.')
      sessions.delete(from)
    }

    res.sendStatus(200)
  }
}
