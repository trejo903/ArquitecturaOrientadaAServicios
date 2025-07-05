import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import Menu from "./Menu";

@Table({
    tableName:'Platillos'
})

class Platillos extends Model{
    @Column({
        type:DataType.STRING(100)
    })
    declare platillo:string
     @Column({
        type:DataType.INTEGER
    })
    declare precio:number

    @ForeignKey(()=>Menu)
    @Column({type:DataType.INTEGER})
    declare menuId:number

    @BelongsTo(()=>Menu)
    declare menu:Menu


}

export default Platillos