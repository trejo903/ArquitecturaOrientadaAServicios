import express from 'express'
import morgan from 'morgan'
import { db } from './config/db'
import colors from 'colors'
import menu from './routes/MenuRouter'
import cors from "cors";


export async function connectDB() {
    try {
        await db.authenticate()
        db.sync({ alter: true })
        console.log(colors.yellow.bold('Conexion exitosa a la base de datos'))
    } catch (error) {
        console.log(colors.red.bold('Fallo la conexion a la base de datos'))
    }
}

connectDB()

const app = express()

app.use(morgan('dev'))
app.use(cors({ origin: "https://hw-10-api-development-frontend.vercel.app" }));
app.use(express.json())

app.use('/api/chatbot',menu)

export default app