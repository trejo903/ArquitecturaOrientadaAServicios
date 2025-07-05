import { AllowNull, Column, DataType, HasMany, Model, Table } from "sequelize-typescript";
import Pedido from "./Pedido";

@Table({tableName:'Usuarios'})
export default class Usuario extends Model{
    @Column({
        type:DataType.STRING(20),
        allowNull:false,
        unique:true
    })
    declare telefono:string

    @HasMany(()=>Pedido)
    declare pedidos: Pedido[]
}