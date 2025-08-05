import { Request, Response } from 'express'
import fs from 'fs'
import Menu from '../models/Menu'
import Platillos from '../models/Platillos'
import Pedido from '../models/Pedido'
import PedidoItem from '../models/PedidoItem'
import Usuario from '../models/Usuarios'
import { sendText } from '../utils/whatsappHelper'

interface SessionData {
  paso: string
  items: { platilloId: number, nombre: string, precio: number, cantidad: number }[]
  categoriaId?: number
  platilloId?: number
}

const sessions = new Map<string, SessionData>()

const verifyToken = 'EAARt5paboZC8BPNZCZCKosHfIMfO8X3LM8a9ZCNtTYv8ZA8Xp2RzwVNTTQcIyRut0kzonLW1SBqKS6S1cnpxNzaULCl8bZCTfSsx4di0RFoHGvKmK5cgfZBWwvdHkYzqbQI1i7FUlZBt35Gp6YPWzxCWIMtl1wFeIiDNdsZBnFNTZA4Dp4PUApcS4b6LWAiiqXztyLaopPtZBr8fVjnZCWZBUt15zEg5fhwgxTXMeoD0BiuRhutS9sRp0QaHp5ITOOAKF84oZD' // Cambia por el que configuraste en el dashboard de Meta

export class MenuController {
  // GET para la verificación del webhook de Meta (obligatorio)
  static mensajesFacebook = (req: Request, res: Response) => {
    const hubVerifyToken = req.query['hub.verify_token']
    const hubChallenge = req.query['hub.challenge']
    if (hubVerifyToken === verifyToken) {
      res.status(200).send(hubChallenge as string)
      return
    }
    res.status(403).send('Token de verificación incorrecto')
    return
  }

  // POST para recibir mensajes de WhatsApp (flujo conversacional)
  static mensajesFacebook2 = async (req: Request, res: Response) => {
    const data = req.body
    const message = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) {
      res.sendStatus(200)
      return
    }

    const from = message.from!
    const text = (message.text?.body || '').trim().toLowerCase()

    // Iniciar sesión de usuario
    let session = sessions.get(from)
    if (!session) {
      session = { paso: 'categoria', items: [] }
      sessions.set(from, session)
    }

    try {
      switch (session.paso) {
        case 'categoria': {
          const menus = await Menu.findAll()
          if (menus.length === 0) {
            await sendText(from, 'No hay categorías registradas.')
            break
          }
          let menuList = 'Elige una categoría:\n'
          menus.forEach((m, i) => {
            menuList += `${i + 1}) ${m.nombre}\n`
          })
          await sendText(from, menuList.trim())
          session.paso = 'esperando_categoria'
          break
        }
        case 'esperando_categoria': {
          const menus = await Menu.findAll()
          const num = parseInt(text)
          if (isNaN(num) || num < 1 || num > menus.length) {
            await sendText(from, `Escribe un número entre 1 y ${menus.length}`)
            break
          }
          const categoria = menus[num - 1]
          session.categoriaId = categoria.id
          const platillos = await Platillos.findAll({ where: { menuId: categoria.id } })
          if (platillos.length === 0) {
            await sendText(from, `No hay platillos para la categoría ${categoria.nombre}. Elige otra.`)
            session.paso = 'categoria'
            break
          }
          let plList = `Selecciona un platillo de ${categoria.nombre}:\n`
          platillos.forEach((p, i) => {
            plList += `${i + 1}) ${p.platillo} $${p.precio}\n`
          })
          await sendText(from, plList.trim())
          session.paso = 'esperando_platillo'
          break
        }
        case 'esperando_platillo': {
          const platillos = await Platillos.findAll({ where: { menuId: session.categoriaId } })
          const num = parseInt(text)
          if (isNaN(num) || num < 1 || num > platillos.length) {
            await sendText(from, `Elige un número entre 1 y ${platillos.length}`)
            break
          }
          const plat = platillos[num - 1]
          session.platilloId = plat.id
          await sendText(from, `¿Cuántas unidades de "${plat.platillo}" deseas?`)
          session.paso = 'esperando_cantidad'
          break
        }
        case 'esperando_cantidad': {
          const qty = parseInt(text)
          if (isNaN(qty) || qty < 1) {
            await sendText(from, 'Ingresa una cantidad válida.')
            break
          }
          const plat = await Platillos.findByPk(session.platilloId!)
          if (!plat) {
            await sendText(from, 'No se encontró el platillo seleccionado. Reinicia con "hola".')
            sessions.delete(from)
            break
          }
          session.items.push({
            platilloId: plat.id,
            nombre: plat.platillo,
            precio: plat.precio,
            cantidad: qty
          })
          await sendText(from, `Agregado: ${qty} x ${plat.platillo}\n¿Quieres agregar otro platillo? (sí/no)`)
          session.paso = 'agregar_mas'
          break
        }
        case 'agregar_mas': {
          if (text.startsWith('s')) {
            session.paso = 'categoria'
            await sendText(from, 'Ok, agrega otro platillo.')
          } else {
            // Mostrar resumen y pedir confirmación
            let resumen = 'Tu pedido:\n'
            let total = 0
            session.items.forEach(i => {
              resumen += `- ${i.cantidad} x ${i.nombre} ($${i.precio * i.cantidad})\n`
              total += i.precio * i.cantidad
            })
            resumen += `Total: $${total}\n¿Confirmas tu pedido? (sí/no)`
            await sendText(from, resumen.trim())
            session.paso = 'confirmar'
          }
          break
        }
        case 'confirmar': {
          if (text.startsWith('s')) {
            // Guardar usuario y pedido
            const [usuario] = await Usuario.findOrCreate({ where: { telefono: from } })
            const total = session.items.reduce((acc, i) => acc + (i.precio * i.cantidad), 0)
            const nuevoPedido = await Pedido.create({
              usuarioId: usuario.id,
              total
            })
            for (const i of session.items) {
              await PedidoItem.create({
                pedidoId: nuevoPedido.id,
                platilloId: i.platilloId,
                cantidad: i.cantidad
              })
            }
            await sendText(from, `✅ ¡Pedido registrado! Tu número de pedido es ${nuevoPedido.id}. Gracias.`)
            sessions.delete(from)
          } else {
            await sendText(from, 'Pedido cancelado. Escribe "hola" para reiniciar.')
            sessions.delete(from)
          }
          break
        }
      }
    } catch (err) {
      console.error('Error flujo WA:', err)
      await sendText(from, 'Ocurrió un error. Intenta más tarde.')
      sessions.delete(from)
    }
    res.sendStatus(200)
  }
}
