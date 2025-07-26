import type {Request,Response} from 'express'
import Menu from '../models/Menu'
import Platillos from '../models/Platillos'
import Pedido from '../models/Pedido'
import PedidoItem from '../models/PedidoItem'
import Usuario from '../models/Usuarios'
import fs from "fs";
import csv from "csv-parser";
const verifyToken = "EAARt5paboZC8BPPyzLmFOUg57WZAW9WFIyHZCmkSPqcTZBcjtAuMPuFKzRA82dywXyLBQR2ZAqsxRgg0tyYyDLRZBHsumlUBhCNp0ChLmFlWC6U5TxNx1rZBoZAwxZBj5eYM9dRgo2PdPfm3ZAsJFkPFGmhNB8OLDqzFijMi77wfdYcMZBlMizdKizNh9SxTI0BaQHas8FFrugRHfEFZCTZCLLDRHUqRYvI11Iq4ZAGRB85WxInDjnsf3kGWjV7Tgg7ZA5O0QZDZD"

export class MenuController{
  static mensajesFacebook2=async(req:Request,res:Response)=>{
    const data = req.body
      fs.appendFileSync("debug_post_log.txt",`${new Date().toISOString()} post request ${JSON.stringify(data)}\n`)
      try {
        const message = data?.entry?.[0]?.changes?.[0]?.values?.messages?.[0]
        if(!message) res.status(400).send('No se encontraron mensajes')
          const from = message.from
          const text = message.text?.body?.toLowerCase() || ''
          const buttonReplay = message.interactive?.button_replay?.id?.toLowerCase() || ''
          const palabrasClave =[
            "hola"
          ]

          let action = ''
          let extractedValue = ''

          if(palabrasClave.some((saludo)=>text.include(saludo))){
            action = 'saludo';
            switch(action){
              case 'saludo':
                //await plantilla_saludo(from,'hello_word')
                
                break
              default:
                console.log('No se encuentra ningura coincidencia')
              
            }
            res.send(200).send('EVENT_RECEIVED')
          }

      } catch (error) {
        console.log(`Error procesando el mensaje ${error}`)
        res.status(500).send('Error interno del servidor')
      }
  }
    static mensajesFacebook=(req:Request,res:Response)=>{
      const hubVerifyToken = req.query["hub.verify_token"]
      const hubChallenge = req.query["hub.challenge"]
      fs.appendFileSync("debug_get_log.txt",`${new Date().toISOString()} get request ${JSON.stringify(req.query)}\n`)
      if(hubVerifyToken === verifyToken){
        res.status(200).send(hubChallenge)
      }else{
        fs.appendFileSync("token.txt",`${new Date().toISOString()} get request ${JSON.stringify(hubVerifyToken)}\n`)
        res.status(403).send('Fallido')
      }
    }
    static createMenu=async(req:Request,res:Response)=>{
        try {
            const nuevoMenu = await Menu.create(req.body)
            res.status(201).json(`Se añadio correctamente el menu`)
            return
        } catch (error) {
            console.log(error)
            res.status(500).json({message:'Error al crear el menu'})
            return
        }
    }
    static getMenu=async(req:Request,res:Response)=>{
        try {
            const categorias = await Menu.findAll()
            res.status(200).json(categorias)
            return    
        } catch (error) {
            console.log(error)
            res.status(500).json({message:'Error al obtener las categorias'})   
        }
    }
    static createPlatillo=async(req:Request,res:Response)=>{
        try {
            const platillo = await Platillos.create(req.body)
            res.status(201).json(`Se añadio correctamente el platillo`)
            return
        } catch (error) {
            console.log(error)
            res.status(500).json({message:'Error al crear el platillo'})
            return
        }
    }
    static createPedido=async(req:Request,res:Response)=>{
        try {
            const{telefono,items}=req.body
            if(!telefono ||!Array.isArray(items)||items.length===0){
                res.status(400).json({mensaje:'Envia telefono y pedido'})
                return
            }
            const[usuario]=await Usuario.findOrCreate({
                where:{telefono}
            })
            const nuevoPedido = await Pedido.create({
                usuarioId:usuario.id,
                total:0
            })
            let total = 0
            for(const{platilloId,cantidad} of items){
                const plat = await Platillos.findByPk(platilloId);
                if(!plat){
                    throw new Error(`Platillo con id ${platilloId} no existe`)
                }
                total += plat.precio * cantidad
                await PedidoItem.create({
                    pedidoId:nuevoPedido.id,
                    platilloId,
                    cantidad
                })
            }

            nuevoPedido.total = total
            await nuevoPedido.save();
            const pedidos = await Pedido.findByPk(nuevoPedido.id,{
                include:[
                    {model:Usuario,attributes:['telefono']},
                    {model:PedidoItem,include:[Platillos]}
                ]
            })
            res.status(201).json(pedidos)
            return
        } catch (error) {
            console.error(error);
            res.status(500).json({ mensaje: 'Error al crear pedido', error: (error as Error).message });
            return
        }
    }
    static getPlatillos = async (req: Request, res: Response) => {
  try {
    const platillos = await Platillos.findAll({
        include: {
        model: Menu,
        attributes: ["id", "nombre"],
      },
    });
    res.status(200).json(platillos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener los platillos" });
  }
};
static updatePlatillo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const platillo = await Platillos.findByPk(id);

    if (!platillo) {
      res.status(404).json({ message: "Platillo no encontrado" });
        return
    }

    await platillo.update(req.body);
    res.status(200).json({ message: "Platillo actualizado correctamente", platillo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al actualizar el platillo" });
  }
};

static deletePlatillo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const platillo = await Platillos.findByPk(id);

    if (!platillo) {
      res.status(404).json({ message: "Platillo no encontrado" });
        return
    }

    await platillo.destroy();
    res.status(200).json({ message: "Platillo eliminado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al eliminar el platillo" });
  }
};
static uploadCSV = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: "No se proporcionó un archivo CSV" });
        return
    }

    const results: any[] = [];

    fs.createReadStream(file.path)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", async () => {
        for (const row of results) {
          const { platillo, precio, menuId } = row;

          // Validaciones opcionales
          if (!platillo || !precio || !menuId) continue;

          await Platillos.create({
            platillo,
            precio: parseFloat(precio),
            menuId: parseInt(menuId),
          });
        }

        fs.unlinkSync(file.path); // Eliminar archivo temporal
        res.status(201).json({ message: "CSV cargado correctamente", cantidad: results.length });
      });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al procesar el archivo CSV" });
  }
};

}