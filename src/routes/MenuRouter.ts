import { Router } from "express";
import { MenuController } from "../controllers/MenuController";
import multer from "multer";

const upload = multer({ dest: "uploads/" });

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

router.get('/platillos', MenuController.getPlatillos);


router.post('/pedido',
    MenuController.createPedido
)

router.put("/platillo/:id", MenuController.updatePlatillo);
router.delete("/platillo/:id", MenuController.deletePlatillo);

router.post(
  "/upload-csv",
  upload.single("file"), // input name="file"
  MenuController.uploadCSV
);


export default router