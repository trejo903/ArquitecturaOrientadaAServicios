import type {Request,Response} from 'express'
import Menu from '../models/Menu'
import Platillos from '../models/Platillos'
import Pedido from '../models/Pedido'
import PedidoItem from '../models/PedidoItem'
import Usuario from '../models/Usuarios'
import fs from "fs";
import csv from "csv-parser";
export class MenuController{
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