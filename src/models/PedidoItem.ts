import { AllowNull, BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import Pedido from "./Pedido";
import Platillos from "./Platillos";

@Table({tableName:'PedidoItems'})
export default class PedidoItem extends Model{

    @ForeignKey(()=>Pedido)
    @Column({type:DataType.INTEGER,allowNull:false})
    declare pedidoId:number
    
    @ForeignKey(()=>Platillos)
    @Column({type:DataType.INTEGER,allowNull:false})
    declare platilloId:number

    @Column({type:DataType.INTEGER,allowNull:false})
    declare cantidad:number

    @BelongsTo(()=>Pedido)
    declare pedido:Pedido
    @BelongsTo(()=>Platillos)
    declare platillo:Platillos
}

