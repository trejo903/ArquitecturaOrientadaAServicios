import { Router } from "express";
import { MenuController } from "../controllers/MenuController";
import multer from "multer";

const upload = multer({ dest: "uploads/" });

const router = Router()



// GET para la verificación de Meta
router.get('/webhook', MenuController.mensajesFacebook)

// POST para recibir los mensajes entrantes
router.post('/webhook', MenuController.mensajesFacebook2)


export default router