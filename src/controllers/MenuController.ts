// src/controllers/MenuController.ts
import { Request, Response } from 'express';
import fs from 'fs';
import Menu from '../models/Menu';
import Platillos from '../models/Platillos';
import Pedido from '../models/Pedido';
import PedidoItem from '../models/PedidoItem';
import Usuario from '../models/Usuarios';
import { sendText, sendButtons, sendList } from '../utils/whatsappHelper';

type Step =
  | 'WELCOME'
  | 'MAIN_MENU'
  | 'SELECT_CATEGORY'
  | 'SELECT_DISH'
  | 'ASK_QUANTITY'
  | 'ADD_MORE'
  | 'CONFIRM';

interface Session {
  step: Step;
  categoryId?: number;
  dishId?: number;
  items: { dishId: number; name: string; price: number; quantity: number }[];
}

// Utilidad: parte un arreglo en trozos
const chunk = <T,>(arr: T[], size: number) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );

const sessions = new Map<string, Session>();

// ⚠️ Usa tu verify token real
const VERIFY_TOKEN =
  'EAARt5paboZC8BPDbqIjocLuI5fEcQJI3ngJ1ZAZCRIVz8ZAEbscplO114MZB76jIfWV79pjLxw4cwNLN0y22Br4qZCLCvNj37bnZAPdcwY8lT2SphYkqzH1anHiQ5yhboAxt5aWlUX7mZCMdM0ZBcYl9WS4yeZC9QmppLnf4GFfqir7LsV9XhDZBJvcpslHKRmgF2ddZAzQbMDRUC603QSPjSkm1KLZB1Ej4EltUnPuXOVyzc';

export class MenuController {
  // GET /webhook → verificación
  static verify(req: Request, res: Response) {
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'] as string;
    if (token === VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Token inválido');
    }
  }

  // POST /webhook → flujo conversacional WhatsApp
  static async webhook(req: Request, res: Response) {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];

    if (!msg) {
      res.sendStatus(200);
      return;
    }

    // ⚠️ Si quieres usar el remitente real: const from = msg.from;
    // Si mantienes sandbox o pruebas internas, deja el hardcode:
    const from = '526182583019';

    const raw = msg.text?.body?.trim() || '';
    const text = raw.toLowerCase();

    // Log cada mensaje
    fs.appendFileSync('wa_debug.log', `${new Date().toISOString()} ${from}: ${raw}\n`);

    // Recuperar o iniciar sesión
    let session = sessions.get(from);
    if (!session) {
      session = { step: 'WELCOME', items: [] };
      sessions.set(from, session);
    }

    try {
      switch (session.step) {
        // 1) Bienvenida
        case 'WELCOME': {
          await sendButtons(from, '🍽️ ¡Bienvenido a Restaurante X! ¿Qué deseas hacer hoy?', [
            { id: 'VIEW_MENU', title: 'Ver menú' }
          ]);
          session.step = 'MAIN_MENU';
          break;
        }

        // 2) Menú principal: botón o texto
        case 'MAIN_MENU': {
          const pressedViewMenu =
            (msg.type === 'interactive' &&
              msg.interactive?.type === 'button_reply' &&
              msg.interactive.button_reply.id === 'VIEW_MENU') ||
            text.includes('ver menú');

          if (pressedViewMenu) {
            const cats = await Menu.findAll();

            const catRows = cats.map((c) => ({ id: `CAT_${c.id}`, title: c.nombre }));
            const catSections = chunk(catRows, 10).slice(0, 10).map((rows, i) => ({
              title: `Categorías ${i + 1}`,
              rows
            }));

            if (catRows.length === 0) {
              await sendText(from, '🚫 No hay categorías disponibles.');
              break;
            }

            if (catRows.length > 100) {
              await sendText(
                from,
                'Hay muchas categorías. Escribe el nombre exacto de la categoría que deseas.'
              );
              session.step = 'SELECT_CATEGORY';
              break;
            }

            await sendList(
              from,
              '📋 Menú del día',
              'Selecciona una categoría:',
              'Usa el selector arriba',
              catSections
            );
            session.step = 'SELECT_CATEGORY';
          }
          break;
        }

        // 3) Selección de categoría (lista o texto/número/nombre)
        case 'SELECT_CATEGORY': {
          const cats = await Menu.findAll();
          let catId: number | undefined;

          // lista interactiva
          if (msg.type === 'interactive' && msg.interactive?.type === 'list_reply') {
            catId = +msg.interactive.list_reply.id.replace('CAT_', '');
          } else {
            // intento por índice
            const idx = +text;
            if (!isNaN(idx) && idx >= 1 && idx <= cats.length) {
              catId = cats[idx - 1].id;
            } else {
              // intento por nombre exacto
              const found = cats.find((c) => c.nombre.toLowerCase() === text);
              if (found) catId = found.id;
            }
          }

          if (!catId) {
            await sendText(from, `❓ No entendí "${raw}". Elige o escribe número/nombre de categoría.`);
            break;
          }

          session.categoryId = catId;

          const platos = await Platillos.findAll({ where: { menuId: catId } });
          if (platos.length === 0) {
            await sendText(from, '🚫 No hay platillos en esa categoría. Elige otra.');
            session.step = 'MAIN_MENU';
            break;
          }

          // Construir filas de platillos y secciones (límite WA)
          const dishRows = platos.map((p) => ({
            id: `DISH_${p.id}`,
            title: `${p.platillo} ($${p.precio})`
          }));

          const sectionsPl = chunk(dishRows, 10).slice(0, 10).map((rows, i) => ({
            title: `Platillos ${i + 1}`,
            rows
          }));

          if (dishRows.length > 100) {
            await sendText(
              from,
              'Hay demasiados platillos en esta categoría. Escribe el nombre exacto del platillo que deseas.'
            );
            session.step = 'SELECT_DISH';
            break;
          }

          await sendList(
            from,
            '🍴 Elige un platillo',
            'Selecciona tu platillo:',
            'Usa el selector arriba',
            sectionsPl
          );
          session.step = 'SELECT_DISH';
          break;
        }

        // 4) Selección de platillo (lista o texto)
        case 'SELECT_DISH': {
          const platos = await Platillos.findAll({ where: { menuId: session.categoryId } });
          let dishId: number | undefined;

          if (msg.type === 'interactive' && msg.interactive?.type === 'list_reply') {
            dishId = +msg.interactive.list_reply.id.replace('DISH_', '');
          } else {
            const idx = +text;
            if (!isNaN(idx) && idx >= 1 && idx <= platos.length) {
              dishId = platos[idx - 1].id;
            } else {
              const found = platos.find((p) => p.platillo.toLowerCase() === text);
              if (found) dishId = found.id;
            }
          }

          if (!dishId) {
            await sendText(from, `❓ No entendí "${raw}". Elige o escribe número/nombre del platillo.`);
            break;
          }

          session.dishId = dishId;
          const elegido = await Platillos.findByPk(dishId)!;
          await sendText(from, `¿Cuántas unidades de "${elegido.platillo}" deseas?`);
          session.step = 'ASK_QUANTITY';
          break;
        }

        // 5) Capturar cantidad
        case 'ASK_QUANTITY': {
          const qty = +text;
          if (isNaN(qty) || qty < 1) {
            await sendText(from, '⚠️ Ingresa un número mayor que 0.');
            break;
          }

          const dish = await Platillos.findByPk(session.dishId!)!;
          session.items.push({
            dishId: dish.id,
            name: dish.platillo,
            price: dish.precio,
            quantity: qty
          });

          await sendText(from, `✅ Agregado ${qty} x ${dish.platillo}.\n¿Deseas agregar otro platillo? (sí/no)`);
          session.step = 'ADD_MORE';
          break;
        }

        // 6) Agregar más o confirmar pedido
        case 'ADD_MORE': {
          if (text.startsWith('s')) {
            // Volver a categorías (paginadas)
            const cats = await Menu.findAll();
            const catRows = cats.map((c) => ({ id: `CAT_${c.id}`, title: c.nombre }));
            const catSections = chunk(catRows, 10).slice(0, 10).map((rows, i) => ({
              title: `Categorías ${i + 1}`,
              rows
            }));

            if (catRows.length > 100) {
              await sendText(
                from,
                'Hay muchas categorías. Escribe el nombre exacto de la categoría que deseas.'
              );
              session.step = 'SELECT_CATEGORY';
              break;
            }

            await sendList(
              from,
              '📋 Menú del día',
              'Selecciona otra categoría:',
              'Usa el selector arriba',
              catSections
            );
            session.step = 'SELECT_CATEGORY';
          } else {
            // Mostrar resumen
            let resumen = '📝 Tu pedido:\n';
            let total = 0;
            session.items.forEach((i) => {
              resumen += `- ${i.quantity} x ${i.name} ($${i.price * i.quantity})\n`;
              total += i.price * i.quantity;
            });
            resumen += `\nTotal: $${total}\n¿Confirmas tu pedido? (sí/no)`;
            await sendText(from, resumen);
            session.step = 'CONFIRM';
          }
          break;
        }

        // 7) Confirmación final
        case 'CONFIRM': {
          if (text.startsWith('s')) {
            const [user] = await Usuario.findOrCreate({ where: { telefono: from } });
            const total = session.items.reduce((a, i) => a + i.price * i.quantity, 0);

            const order = await Pedido.create({ usuarioId: user.id, total });
            for (const it of session.items) {
              await PedidoItem.create({
                pedidoId: order.id,
                platilloId: it.dishId,
                cantidad: it.quantity
              });
            }
            await sendText(from, `🎉 Pedido #${order.id} registrado con total $${total}.\n¡Gracias!`);
          } else {
            await sendText(from, '❌ Pedido cancelado. Escribe "hola" para reiniciar.');
          }
          sessions.delete(from);
          break;
        }
      }
    } catch (e: any) {
      // Log del error real de la API de WhatsApp para depurar límites u otros problemas
      console.error('❌ Error en flujo WA:', e?.response?.data || e);
      await sendText(from, '⚠️ Algo salió mal, inténtalo más tarde.');
      sessions.delete(from);
    }

    // ACK 200 siempre
    res.sendStatus(200);
  }
}
