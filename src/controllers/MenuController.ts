import { Request, Response } from 'express'
import fs from 'fs'
import Menu from '../models/Menu'
import Platillos from '../models/Platillos'
import Pedido from '../models/Pedido'
import PedidoItem from '../models/PedidoItem'
import Usuario from '../models/Usuarios'
import { sendText, sendList } from '../utils/whatsappHelper'


interface Session { paso: string; data: any }
const sessions = new Map<string, Session>()

const verifyToken = 'EAARt5paboZC8BPDbqIjocLuI5fEcQJI3ngJ1ZAZCRIVz8ZAEbscplO114MZB76jIfWV79pjLxw4cwNLN0y22Br4qZCLCvNj37bnZAPdcwY8lT2SphYkqzH1anHiQ5yhboAxt5aWlUX7mZCMdM0ZBcYl9WS4yeZC9QmppLnf4GFfqir7LsV9XhDZBJvcpslHKRmgF2ddZAzQbMDRUC603QSPjSkm1KLZB1Ej4EltUnPuXOVyzc'

export class MenuController {
   // GET /webhook → verificación
  static mensajesFacebook = (req: Request, res: Response) => {
    const hubVerifyToken = req.query['hub.verify_token']
    const hubChallenge = req.query['hub.challenge']
    if (hubVerifyToken === verifyToken) res.status(200).send(hubChallenge as string)
    res.status(403).send('Fallido')
  }

  // POST /webhook → conversación
  static mensajesFacebook2 = async (req: Request, res: Response) => {
    const data = req.body
    fs.appendFileSync('debug_post_log.txt', `${new Date().toISOString()} ${JSON.stringify(data)}\n`)

    const message = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!message) res.sendStatus(200)

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
          await sendText(from, "¡Hola! Bienvenido a Restaurante.\nElige: 1) Entradas  2) Tacos  3) Bebidas")
          session.paso = 'esperando_categoria'
          break

        case 'esperando_categoria':
          const cat = parseInt(text)
          if (![1,2,3].includes(cat)) {
            await sendText(from, 'Escribe 1, 2 o 3.')
            break
          }
          session.data.categoria = cat
          await sendText(from, `Categoría ${cat}. ¿Cuántas unidades?`)
          session.paso = 'esperando_cantidad'
          break

        case 'esperando_cantidad':
          const qty = parseInt(text)
          if (!qty || qty < 1) {
            await sendText(from, 'Número inválido.')
            break
          }
          session.data.items.push({ categoria: session.data.categoria, cantidad: qty })
          await sendText(from, `Agregaste ${qty} x categoría ${session.data.categoria}.\n¿Confirmas? (sí/no)`)
          session.paso = 'confirmar'
          break

        case 'confirmar':
          if (text.startsWith('s')) {
            const response = await Pedido.create({
              usuarioId: (await Usuario.findOrCreate({ where: { telefono: from } }))[0].id,
              total: 0
            })
            // Aquí insertar lógica de PedidoItem y actualizar total...
            await sendText(from, `✅ Pedido registrado con ID ${response.id}`)
          } else {
            await sendText(from, 'Pedido cancelado. Escribe "hola" para reiniciar.')
          }
          sessions.delete(from)
          break
      }
    } catch (err) {
      console.error('Error flujo WA:', err)
      await sendText(from, 'Lo siento, ocurrió un error. Intenta más tarde.')
      sessions.delete(from)
    }

    res.sendStatus(200)
  }




  // POST /menu
  static createMenu = async (req: Request, res: Response) => {
    console.log('[API] createMenu → Body:', req.body)
    try {
      const nuevoMenu = await Menu.create(req.body)
      console.log('[API] createMenu → Creado:', nuevoMenu.id)
      res.status(201).json({ mensaje: 'Menú creado correctamente', id: nuevoMenu.id })
      return
    } catch (error) {
      console.error('[API] createMenu Error:', error)
       res.status(500).json({ mensaje: 'Error al crear el menú' })
        return
        }
  }

  // GET /menu
  static getMenu = async (req: Request, res: Response) => {
    console.log('[API] getMenu')
    try {
      const categorias = await Menu.findAll()
      console.log('[API] getMenu → Encontradas:', categorias.length)
      res.status(200).json(categorias)
      return
    } catch (error) {
      console.error('[API] getMenu Error:', error)
      res.status(500).json({ mensaje: 'Error al obtener categorías' })
      return
    }
  }

  // POST /platillo
  static createPlatillo = async (req: Request, res: Response) => {
    console.log('[API] createPlatillo → Body:', req.body)
    try {
      const platillo = await Platillos.create(req.body)
      console.log('[API] createPlatillo → Creado:', platillo.id)
      res.status(201).json({ mensaje: 'Platillo creado correctamente', id: platillo.id })
      return
    } catch (error) {
      console.error('[API] createPlatillo Error:', error)
      res.status(500).json({ mensaje: 'Error al crear el platillo' })
      return
    }
  }

  // GET /platillos
  static getPlatillos = async (req: Request, res: Response) => {
    console.log('[API] getPlatillos')
    try {
      const platillos = await Platillos.findAll({
        include: {
          model: Menu,
          attributes: ['id', 'nombre'],
        },
      })
      console.log('[API] getPlatillos → Encontrados:', platillos.length)
       res.status(200).json(platillos)
      return
      } catch (error) {
      console.error('[API] getPlatillos Error:', error)
      res.status(500).json({ mensaje: 'Error al obtener los platillos' })
      return
    }
  }

  // PUT /platillo/:id
  static updatePlatillo = async (req: Request, res: Response) => {
    console.log('[API] updatePlatillo → ID:', req.params.id, 'Body:', req.body)
    try {
      const platillo = await Platillos.findByPk(req.params.id)
      if (!platillo) {
        console.log('[API] updatePlatillo → No existe platillo con ID', req.params.id)
        res.status(404).json({ mensaje: 'Platillo no encontrado' })
        return
      }
      await platillo.update(req.body)
      console.log('[API] updatePlatillo → Actualizado:', platillo.id)
      res.status(200).json({ mensaje: 'Platillo actualizado', platillo })
      return
    } catch (error) {
      console.error('[API] updatePlatillo Error:', error)
      res.status(500).json({ mensaje: 'Error al actualizar el platillo' })
      return
    }
  }

  // DELETE /platillo/:id
  static deletePlatillo = async (req: Request, res: Response) => {
    console.log('[API] deletePlatillo → ID:', req.params.id)
    try {
      const platillo = await Platillos.findByPk(req.params.id)
      if (!platillo) {
        console.log('[API] deletePlatillo → No existe platillo con ID', req.params.id)
        res.status(404).json({ mensaje: 'Platillo no encontrado' })
        return
      }
      await platillo.destroy()
      console.log('[API] deletePlatillo → Eliminado:', platillo.id)
      res.status(200).json({ mensaje: 'Platillo eliminado correctamente' })
      return
    } catch (error) {
      console.error('[API] deletePlatillo Error:', error)
      res.status(500).json({ mensaje: 'Error al eliminar el platillo' })
      return
    }
  }

  // POST /upload-csv
  static uploadCSV = async (req: Request, res: Response) => {
    console.log('[API] uploadCSV → Archivo:', req.file?.path)
    try {
      const file = req.file
      if (!file) {
        console.log('[API] uploadCSV → No se proporcionó archivo')
        res.status(400).json({ mensaje: 'No se proporcionó un archivo CSV' })
        return
      }

      const results: any[] = []
      fs.createReadStream(file.path)
        .on('data', (row) => {
          results.push(row)
        })
        .on('end', async () => {
          console.log('[API] uploadCSV → Filas leídas:', results.length)
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
          console.log('[API] uploadCSV → CSV procesado y archivo eliminado')
          res.status(201).json({
            mensaje: 'CSV cargado correctamente',
            cantidad: results.length,
          })
          return
        })
    } catch (error) {
      console.error('[API] uploadCSV Error:', error)
      res.status(500).json({ mensaje: 'Error al procesar el archivo CSV' })
      return
    }
  }
}
