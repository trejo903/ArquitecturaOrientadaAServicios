import { AllowNull, BelongsTo, Column, DataType, ForeignKey, HasMany, Model, Table } from "sequelize-typescript";
import PedidoItem from "./PedidoItem";
import Usuario from "./Usuarios";

@Table({tableName:'Pedidos'})
export default class Pedido extends Model{
    @Column({
        type:DataType.DATE,
        defaultValue:DataType.NOW
    })
    declare fecha:Date
    @Column({
        type:DataType.FLOAT,
        allowNull:false
    })
    declare total:number

    @ForeignKey(()=>Usuario)
    @Column({type:DataType.INTEGER,allowNull:false})
    declare usuarioId:number

    @BelongsTo(()=>Usuario)
    declare usuario : Usuario


    @HasMany(()=>PedidoItem)
    declare items:PedidoItem[]
}