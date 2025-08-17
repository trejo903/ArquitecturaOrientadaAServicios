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
  catOffset: number;
  dishOffset: number;
}

const sessions = new Map<string, Session>();

const VERIFY_TOKEN =
  'EAARt5paboZC8BPDbqIjocLuI5fEcQJI3ngJ1ZAZCRIVz8ZAEbscplO114MZB76jIfWV79pjLxw4cwNLN0y22Br4qZCLCvNj37bnZAPdcwY8lT2SphYkqzH1anHiQ5yhboAxt5aWlUX7mZCMdM0ZBcYl9WS4yeZC9QmppLnf4GFfqir7LsV9XhDZBJvcpslHKRmgF2ddZAzQbMDRUC603QSPjSkm1KLZB1Ej4EltUnPuXOVyzc';

// ====== Límites de WhatsApp ======
// Fila: title <= 24 chars, description <= 72 chars, máx 10 filas totales.
const TITLE_MAX = 24;
const DESC_MAX = 72;
const PAGE_SIZE = 9; // 9 + "Ver más" = 10

const truncate = (s: string, n: number) =>
  s.length <= n ? s : s.slice(0, Math.max(0, n - 1)).trimEnd() + '…';

// Construye filas paginadas cumpliendo límites
function buildPagedRows<
  T extends { id: number; nombre?: string; platillo?: string; precio?: number }
>(list: T[], offset: number, type: 'CAT' | 'DISH') {
  const slice = list.slice(offset, offset + PAGE_SIZE);

  const rows = slice.map((item) => {
    if (type === 'CAT') {
      const title = truncate(String(item.nombre ?? ''), TITLE_MAX);
      return { id: `CAT_${item.id}`, title };
    } else {
      const name = String(item.platillo ?? '');
      const title = truncate(name, TITLE_MAX); // solo nombre
      const description = truncate(`$${item.precio}`, DESC_MAX); // precio en description
      return { id: `DISH_${item.id}`, title, description };
    }
  });

  const hasMore = offset + PAGE_SIZE < list.length;
  if (hasMore) rows.push({ id: `${type}_MORE`, title: '▶ Ver más' }); // 10ma fila

  return { rows, hasMore };
}

export class MenuController {
  // GET /webhook
  static verify(req: Request, res: Response) {
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'] as string;
    if (token === VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return
    }
    res.status(403).send('Token inválido');
    return
  }

  // POST /webhook
  static async webhook(req: Request, res: Response) {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];
    console.log(entry)
    console.log('-----------------------------------------------------------------------------')
    if (!msg) {
      res.sendStatus(200);
      return; // <<<< IMPORTANTÍSIMO
    }

    // En prod usa el real: const from = msg.from;
    const from = '526182583019';

    // En mensajes interactivos no existe msg.text
    const raw = (msg.text?.body ?? '').trim();
    const text = raw.toLowerCase();

    fs.appendFileSync('wa_debug.log', `${new Date().toISOString()} ${from}: ${raw}\n`);

    let session = sessions.get(from);
    if (!session) {
      session = { step: 'WELCOME', items: [], catOffset: 0, dishOffset: 0 };
      sessions.set(from, session);
    }

    try {
      switch (session.step) {
        case 'WELCOME': {
          await sendButtons(from, '🍽️ ¡Bienvenido a Restaurante X! ¿Qué deseas hacer hoy?', [
            { id: 'VIEW_MENU', title: 'Ver menú' },
          ]);
          session.step = 'MAIN_MENU';
          break;
        }

        case 'MAIN_MENU': {
          const isButton =
            msg.type === 'interactive' &&
            msg.interactive?.type === 'button_reply' &&
            msg.interactive.button_reply.id === 'VIEW_MENU';

          if (isButton || text.includes('ver menú')) {
            session.catOffset = 0;
            const cats = await Menu.findAll();
            if (cats.length === 0) {
              await sendText(from, '🚫 No hay categorías disponibles.');
              break;
            }
            const { rows } = buildPagedRows(cats as any, session.catOffset, 'CAT');
            await sendList(
              from,
              '📋 Menú del día',
              'Selecciona una categoría:',
              'Usa el selector arriba',
              [{ title: 'Categorías', rows }]
            );
            session.step = 'SELECT_CATEGORY';
          }
          break;
        }

        case 'SELECT_CATEGORY': {
          const cats = await Menu.findAll();

          // ¿Ver más?
          if (msg.type === 'interactive' && msg.interactive?.type === 'list_reply') {
            const id = msg.interactive.list_reply.id;
            if (id === 'CAT_MORE') {
              session.catOffset += PAGE_SIZE;
              const { rows } = buildPagedRows(cats as any, session.catOffset, 'CAT');
              await sendList(
                from,
                '📋 Menú del día',
                'Selecciona una categoría:',
                'Usa el selector arriba',
                [{ title: 'Categorías', rows }]
              );
              break;
            }
          }

          // Selección real
          let catId: number | undefined;
          if (msg.type === 'interactive' && msg.interactive?.type === 'list_reply') {
            const id = msg.interactive.list_reply.id;
            if (id.startsWith('CAT_')) catId = +id.replace('CAT_', '');
          } else {
            const idx = Number(text);
            if (!Number.isNaN(idx) && idx >= 1 && idx <= cats.length) {
              catId = cats[idx - 1].id;
            } else {
              const found = cats.find((c: any) => c.nombre?.toLowerCase() === text);
              if (found) catId = (found as any).id;
            }
          }

          if (!catId) {
            // si no fue "ver más" y tampoco eligió una cat válida
            if (!(msg.type === 'interactive' && msg.interactive?.type === 'list_reply')) {
              await sendText(from, `❓ No entendí "${raw}". Elige o escribe número/nombre de categoría.`);
            }
            break;
          }

          session.categoryId = catId;
          session.dishOffset = 0;

          const platos = await Platillos.findAll({ where: { menuId: catId } });
          if (platos.length === 0) {
            await sendText(from, '🚫 No hay platillos en esa categoría. Elige otra.');
            session.step = 'MAIN_MENU';
            break;
          }

          const { rows } = buildPagedRows(platos as any, session.dishOffset, 'DISH');
          await sendList(
            from,
            '🍴 Elige un platillo',
            'Selecciona tu platillo:',
            'Usa el selector arriba',
            [{ title: 'Platillos', rows }]
          );
          session.step = 'SELECT_DISH';
          break;
        }

        case 'SELECT_DISH': {
          const platos = await Platillos.findAll({ where: { menuId: session.categoryId } });

          // Ver más
          if (msg.type === 'interactive' && msg.interactive?.type === 'list_reply') {
            const id = msg.interactive.list_reply.id;
            if (id === 'DISH_MORE') {
              session.dishOffset += PAGE_SIZE;
              const { rows } = buildPagedRows(platos as any, session.dishOffset, 'DISH');
              await sendList(
                from,
                '🍴 Elige un platillo',
                'Selecciona tu platillo:',
                'Usa el selector arriba',
                [{ title: 'Platillos', rows }]
              );
              break;
            }
          }

          // Selección real
          let dishId: number | undefined;
          if (msg.type === 'interactive' && msg.interactive?.type === 'list_reply') {
            const id = msg.interactive.list_reply.id;
            if (id.startsWith('DISH_')) dishId = +id.replace('DISH_', '');
          } else {
            const idx = Number(text);
            if (!Number.isNaN(idx) && idx >= 1 && idx <= platos.length) {
              dishId = platos[idx - 1].id;
            } else {
              const found = platos.find((p: any) => p.platillo?.toLowerCase() === text);
              if (found) dishId = (found as any).id;
            }
          }

          if (!dishId) {
            if (!(msg.type === 'interactive' && msg.interactive?.type === 'list_reply')) {
              await sendText(from, `❓ No entendí "${raw}". Elige o escribe número/nombre del platillo.`);
            }
            break;
          }

          session.dishId = dishId;
          const elegido = await Platillos.findByPk(dishId)!;
          await sendText(from, `¿Cuántas unidades de "${(elegido as any).platillo}" deseas?`);
          session.step = 'ASK_QUANTITY';
          break;
        }

        case 'ASK_QUANTITY': {
          const qty = Number(text);
          if (Number.isNaN(qty) || qty < 1) {
            await sendText(from, '⚠️ Ingresa un número mayor que 0.');
            break;
          }
          const dish = await Platillos.findByPk(session.dishId!)!;
          session.items.push({
            dishId: (dish as any).id,
            name: (dish as any).platillo,
            price: (dish as any).precio,
            quantity: qty,
          });

          await sendText(
            from,
            `✅ Agregado ${qty} x ${(dish as any).platillo}.\n¿Deseas agregar otro platillo? (sí/no)`
          );
          session.step = 'ADD_MORE';
          break;
        }

        case 'ADD_MORE': {
          if (text.startsWith('s')) {
            // Volver a categorías
            session.catOffset = 0;
            const cats = await Menu.findAll();
            const { rows } = buildPagedRows(cats as any, session.catOffset, 'CAT');
            await sendList(
              from,
              '📋 Menú del día',
              'Selecciona otra categoría:',
              'Usa el selector arriba',
              [{ title: 'Categorías', rows }]
            );
            session.step = 'SELECT_CATEGORY';
          } else {
            // Resumen
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

        case 'CONFIRM': {
          if (text.startsWith('s')) {
            const [user] = await Usuario.findOrCreate({ where: { telefono: from } });
            const total = session.items.reduce((a, i) => a + i.price * i.quantity, 0);
            const order = await Pedido.create({ usuarioId: (user as any).id, total });
            for (const it of session.items) {
              await PedidoItem.create({
                pedidoId: (order as any).id,
                platilloId: it.dishId,
                cantidad: it.quantity,
              });
            }
            await sendText(from, `🎉 Pedido #${(order as any).id} registrado con total $${total}.\n¡Gracias!`);
          } else {
            await sendText(from, '❌ Pedido cancelado. Escribe "hola" para reiniciar.');
          }
          sessions.delete(from);
          break;
        }
      }
    } catch (e: any) {
      console.error('❌ Error en flujo WA:', e?.response?.data || e);
      await sendText(from, '⚠️ Algo salió mal, inténtalo más tarde.');
      sessions.delete(from);
    }

    res.sendStatus(200);
  }
}
