import { Request, Response } from 'express'
import fs from 'fs'
import csv from 'csv-parser'
import Menu from '../models/Menu'
import Platillos from '../models/Platillos'
import Pedido from '../models/Pedido'
import PedidoItem from '../models/PedidoItem'
import Usuario from '../models/Usuarios'
import { sendText, sendList } from '../utils/whatsappHelper'

interface Session { paso: string; data: any }
const sessions = new Map<string, Session>()

const verifyToken = 'EAARt5paboZC8BPNhbqZCHIPrZAIItzL4FEyEAXYL0x8R0aEOoD8G7i8tLs5YBrUz6O1iGM0vmw10cUuhYQu0SlAFE5xAPNsmoda8fmkHapO8yFZA4JqNUrSts0UDyBNCDd9yWZAUfJOKFAnwtfAUCSkJllgmZCqRgLS5x3jUGfnlZBZCM4gdjDRPv7VLJ88smCuLHdAGtK7ukTBl1uXzKt8P1ExvSFxCwMJ9gruw0dufCpaO3ipTxXr3zSkvl37ylAZDZD'

export class MenuController {
  // GET /webhook → verificación
  static mensajesFacebook = (req: Request, res: Response) => {
    const hubVerifyToken = req.query['hub.verify_token']
    const hubChallenge = req.query['hub.challenge']
    if (hubVerifyToken === verifyToken) {
      res.status(200).send(hubChallenge as string)
      return
    }
    res.status(403).send('Fallido')
    return
  }

  // POST /webhook → conversación de WhatsApp
  static mensajesFacebook2 = async (req: Request, res: Response) => {
    const data = req.body
    fs.appendFileSync('debug_post_log.txt', `${new Date().toISOString()} ${JSON.stringify(data)}\n`)

    const message = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) res.sendStatus(200) // WhatsApp pide 200 aunque no haya mensaje

    const from = message.from!
    const text = message.text?.body?.trim().toLowerCase() || ''

    // Iniciar o recuperar sesión
    let session = sessions.get(from)
    if (!session) {
      session = { paso: 'inicio', data: { items: [] } }
      sessions.set(from, session)
    }

    try {
      switch (session.paso) {
        case 'inicio':
          await sendText(from, '¡Hola! Bienvenido a Restaurante.\nElige: 1) Entradas  2) Tacos  3) Bebidas')
          session.paso = 'esperando_categoria'
          break

        case 'esperando_categoria': {
          const cat = parseInt(text)
          if (![1, 2, 3].includes(cat)) {
            await sendText(from, 'Escribe 1, 2 o 3.')
            break
          }
          session.data.categoria = cat
          await sendText(from, `Elegiste la categoría ${cat}. ¿Cuántas unidades quieres?`)
          session.paso = 'esperando_cantidad'
          break
        }

        case 'esperando_cantidad': {
          const qty = parseInt(text)
          if (!qty || qty < 1) {
            await sendText(from, 'Por favor escribe un número válido (mayor que 0).')
            break
          }
          session.data.items.push({ categoria: session.data.categoria, cantidad: qty })
          await sendText(from, `Agregaste ${qty} x categoría ${session.data.categoria}.\n¿Confirmas? (sí/no)`)
          session.paso = 'confirmar'
          break
        }

        case 'confirmar': {
          if (text.startsWith('s')) {
            // Buscar o crear usuario
            const [usuario] = await Usuario.findOrCreate({ where: { telefono: from } })
            // Crear pedido
            const nuevoPedido = await Pedido.create({
              usuarioId: usuario.id,
              total: 0,
            })
            // Crear items de pedido
            let total = 0
            for (const i of session.data.items) {
              // Aquí deberías mapear el id real de la categoría/platillo según tu app
              await PedidoItem.create({
                pedidoId: nuevoPedido.id,
                platilloId: i.categoria, // Ajusta si necesitas mapear categoría a platillo real
                cantidad: i.cantidad,
              })
              // Suma el total si lo necesitas
              // const plat = await Platillos.findByPk(i.categoria)
              // if (plat) total += plat.precio * i.cantidad
            }
            // nuevoPedido.total = total
            // await nuevoPedido.save()
            await sendText(from, `✅ ¡Pedido registrado! Gracias por tu orden.`)
          } else {
            await sendText(from, 'Pedido cancelado. Escribe "hola" para reiniciar.')
          }
          sessions.delete(from)
          break
        }
      }
    } catch (err) {
      console.error('Error flujo WA:', err)
      await sendText(from, 'Lo siento, ocurrió un error. Intenta más tarde.')
      sessions.delete(from)
    }

  res.sendStatus(200)
  return
  }

  // POST /menu
  static createMenu = async (req: Request, res: Response) => {
    try {
      const nuevoMenu = await Menu.create(req.body)
      res.status(201).json({ mensaje: 'Menú creado correctamente', id: nuevoMenu.id })
      return
    } catch (error) {
      res.status(500).json({ mensaje: 'Error al crear el menú' })
      return
    }
  }

  // GET /menu
  static getMenu = async (req: Request, res: Response) => {
    try {
      const categorias = await Menu.findAll()
      res.status(200).json(categorias)
      return
    } catch (error) {
      res.status(500).json({ mensaje: 'Error al obtener categorías' })
      return
    }
  }

  // POST /platillo
  static createPlatillo = async (req: Request, res: Response) => {
    try {
      const platillo = await Platillos.create(req.body)
      res.status(201).json({ mensaje: 'Platillo creado correctamente', id: platillo.id })
      return
    } catch (error) {
      res.status(500).json({ mensaje: 'Error al crear el platillo' })
      return
    }
  }

  // GET /platillos
  static getPlatillos = async (req: Request, res: Response) => {
    try {
      const platillos = await Platillos.findAll({
        include: { model: Menu, attributes: ['id', 'nombre'] }
      })
      res.status(200).json(platillos)
      return
    } catch (error) {
      res.status(500).json({ mensaje: 'Error al obtener los platillos' })
      return
    }
  }

  // PUT /platillo/:id
  static updatePlatillo = async (req: Request, res: Response) => {
    try {
      const platillo = await Platillos.findByPk(req.params.id)
      if (!platillo) {
        res.status(404).json({ mensaje: 'Platillo no encontrado' })
        return
      }
      await platillo.update(req.body)
      res.status(200).json({ mensaje: 'Platillo actualizado', platillo })
      return
    } catch (error) {
      res.status(500).json({ mensaje: 'Error al actualizar el platillo' })
      return
    }
  }

  // DELETE /platillo/:id
  static deletePlatillo = async (req: Request, res: Response) => {
    try {
      const platillo = await Platillos.findByPk(req.params.id)
      if (!platillo) {
        res.status(404).json({ mensaje: 'Platillo no encontrado' })
        return
      }
      await platillo.destroy()
      res.status(200).json({ mensaje: 'Platillo eliminado correctamente' })
      return
    } catch (error) {
      res.status(500).json({ mensaje: 'Error al eliminar el platillo' })
      return
    }
  }

  // POST /upload-csv
  static uploadCSV = async (req: Request, res: Response) => {
    try {
      const file = req.file
      if (!file) {
        res.status(400).json({ mensaje: 'No se proporcionó un archivo CSV' })
        return
      }
      const results: any[] = []
      fs.createReadStream(file.path)
        .pipe(csv())
        .on('data', (row) => results.push(row))
        .on('end', async () => {
          for (const row of results) {
            const { platillo, precio, menuId } = row
            if (!platillo || !precio || !menuId) continue
            await Platillos.create({
              platillo,
              precio: parseFloat(precio),
              menuId: parseInt(menuId),
            })
          }
          fs.unlinkSync(file.path)
          res.status(201).json({
            mensaje: 'CSV cargado correctamente',
            cantidad: results.length,
          })
          return
        })
    } catch (error) {
      res.status(500).json({ mensaje: 'Error al procesar el archivo CSV' })
      return
    }
  }
}
