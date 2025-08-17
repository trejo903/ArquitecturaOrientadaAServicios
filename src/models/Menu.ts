import { Column, DataType, HasMany, Model, Table } from "sequelize-typescript";
import Platillos from "./Platillos";

@Table({
    tableName:'Menu'
})

class Menu extends Model{
    @Column({
        type:DataType.STRING(100)
    })
    declare nombre:string

    @HasMany(()=>Platillos)
    declare platillos:Platillos[]
}

export default Menu
