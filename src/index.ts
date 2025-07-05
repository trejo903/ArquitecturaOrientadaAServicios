import colors from 'colors'
import app from './server'

const port = 5000 

app.listen(port,()=>{
    console.log(colors.blue.bold(`Rest API funcionando en el puerto ${port}`))
})
