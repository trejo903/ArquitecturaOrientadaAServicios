import type { Request, Response } from 'express'
import Menu from '../models/Menu'
import Platillos from '../models/Platillos'
import Pedido from '../models/Pedido'
import PedidoItem from '../models/PedidoItem'
import Usuario from '../models/Usuarios'
import fs from 'fs'
import csv from 'csv-parser'
import { sendTemplate } from '../utils/whatsappHelper'

const verifyToken = 'EAARt5paboZC8BPPyzLmFOUg57WZAW9WFIyHZCmkSPqcTZBcjtAuMPuFKzRA82dywXyLBQR2ZAqsxRgg0tyYyDLRZBHsumlUBhCNp0ChLmFlWC6U5TxNx1rZBoZAwxZBj5eYM9dRgo2PdPfm3ZAsJFkPFGmhNB8OLDqzFijMi77wfdYcMZBlMizdKizNh9SxTI0BaQHas8FFrugRHfEFZCTZCLLDRHUqRYvI11Iq4ZAGRB85WxInDjnsf3kGWjV7Tgg7ZA5O0QZDZD'

export class MenuController {
  // GET /webhook → verificación
 static mensajesFacebook = (req: Request, res: Response) => {
    console.log('[Webhook GET] Entrando a mensajesFacebook', req.query)
    const hubVerifyToken = req.query['hub.verify_token']
    const hubChallenge = req.query['hub.challenge']

    if (hubVerifyToken === verifyToken) {
      console.log('[Webhook GET] Token verificado correctamente:', hubVerifyToken)
      res.status(200).send(hubChallenge as string)
      return
    } else {
      console.log('[Webhook GET] Token inválido:', hubVerifyToken)
      res.status(403).send('Fallido')
      return
    }
  }

  // POST /webhook → recepción de mensajes
  static mensajesFacebook2 = async (req: Request, res: Response) => {
    console.log('[Webhook POST] Entrando a mensajesFacebook2')
    const data = req.body
    fs.appendFileSync(
      'debug_post_log.txt',
      `${new Date().toISOString()} POST /webhook ${JSON.stringify(data)}\n`
    )
    console.log('[Webhook POST] Payload recibido:', JSON.stringify(data))

    try {
      // Atención: es "value", no "values"
      const message = data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
      if (!message) {
        console.log('[Webhook POST] No se encontró mensaje en el payload')
        res.status(400).send('No se encontraron mensajes')
        return
      }
      console.log('[Webhook POST] Mensaje parseado:', message)

      const from = message.from     // número E.164 sin '+'
      const text = message.text?.body?.toLowerCase() || ''
      console.log(`[Webhook POST] De: ${from} — Texto: "${text}"`)

      // ejemplo de palabras clave
      const palabrasClave = ['hola']
      if (palabrasClave.some(saludo => text.includes(saludo))) {
        console.log('[Webhook POST] Detectado saludo ("hola"), enviando plantilla…')
        await sendTemplate(
          from,
          'saludo',   // nombre exacto de la plantilla en tu panel
          'es_MX',    // código de idioma registrado
          [
            // si tu plantilla tiene botones, puedes especificar aquí:
            // { type: 'button', sub_type: 'quick_reply', index: '0' },
            // { type: 'button', sub_type: 'quick_reply', index: '1' }
          ]
        )
      } else {
        console.log('[Webhook POST] Ninguna palabra clave coincide')
      }

      console.log('[Webhook POST] Enviando 200 a Meta (EVENT_RECEIVED)')
      res.sendStatus(200)
      return
    } catch (error) {
      console.error('[Webhook POST] Error procesando el mensaje:', error)
      res.sendStatus(500)
      return
    }
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
        .pipe(csv())
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
