import { Router } from "express";
import { MenuController } from "../controllers/MenuController";



const router = Router()

router.post('/menu',
    MenuController.createMenu
)
router.get('/menu',
    MenuController.getMenu
)

router.post('/platillo',
    MenuController.createPlatillo
)

router.post('/pedido',
    MenuController.createPedido
)

export default router