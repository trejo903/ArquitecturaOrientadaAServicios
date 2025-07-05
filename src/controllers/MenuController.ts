import type {Request,Response} from 'express'
import Menu from '../models/Menu'
import Platillos from '../models/Platillos'
import Pedido from '../models/Pedido'
import PedidoItem from '../models/PedidoItem'
import Usuario from '../models/Usuarios'
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
}