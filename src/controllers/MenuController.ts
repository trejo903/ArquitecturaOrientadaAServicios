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

const TITLE_MAX = 24;
const DESC_MAX = 72;
const PAGE_SIZE = 9;

const truncate = (s: string, n: number) =>
  s.length <= n ? s : s.slice(0, Math.max(0, n - 1)).trimEnd() + '…';

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
      const title = truncate(name, TITLE_MAX);
      const description = truncate(`$${item.precio}`, DESC_MAX);
      return { id: `DISH_${item.id}`, title, description };
    }
  });

  const hasMore = offset + PAGE_SIZE < list.length;
  if (hasMore) rows.push({ id: `${type}_MORE`, title: '▶ Ver más' });

  return { rows, hasMore };
}

export class MenuController {
  static verify(req: Request, res: Response) {
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'] as string;
    console.log('[VERIFY] Recibiendo petición de verificación.');
    if (token === VERIFY_TOKEN) {
      console.log('[VERIFY] Token válido, respondiendo challenge.');
      res.status(200).send(challenge);
      return;
    }
    console.log('[VERIFY] Token inválido.');
    res.status(403).send('Token inválido');
    return;
  }

  static async webhook(req: Request, res: Response) {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];
    if (!msg) {
      console.log('[WEBHOOK] No hay mensaje en la entrada.');
      res.sendStatus(200);
      return;
    }

    const from = '526182583019';
    const raw = (msg.text?.body ?? '').trim();
    const text = raw.toLowerCase();

    console.log(`[MSG] De: ${from} | Texto: "${raw}" | Tipo: ${msg.type}`);
    fs.appendFileSync('wa_debug.log', `${new Date().toISOString()} ${from}: ${raw}\n`);

    let session = sessions.get(from);
    if (!session) {
      console.log('[SESSION] Nueva sesión creada.');
      session = { step: 'WELCOME', items: [], catOffset: 0, dishOffset: 0 };
      sessions.set(from, session);
    } else {
      console.log(`[SESSION] Sesión existente en paso: ${session.step}`);
    }

    try {
      switch (session.step) {
        case 'WELCOME': {
          console.log('[STEP] WELCOME → MAIN_MENU');
          await sendButtons(from, '🍽️ ¡Bienvenido a Restaurante X! ¿Qué deseas hacer hoy?', [
            { id: 'VIEW_MENU', title: 'Ver menú' },
          ]);
          session.step = 'MAIN_MENU';
          break;
        }

        case 'MAIN_MENU': {
          console.log('[STEP] MAIN_MENU');
          const isButton =
            msg.type === 'interactive' &&
            msg.interactive?.type === 'button_reply' &&
            msg.interactive.button_reply.id === 'VIEW_MENU';

          if (isButton || text.includes('ver menú')) {
            console.log('[ACTION] Usuario solicitó ver menú.');
            session.catOffset = 0;
            const cats = await Menu.findAll();
            if (cats.length === 0) {
              console.log('[ACTION] No hay categorías disponibles.');
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
          console.log('[STEP] SELECT_CATEGORY');
          const cats = await Menu.findAll();

          if (msg.type === 'interactive' && msg.interactive?.type === 'list_reply') {
            const id = msg.interactive.list_reply.id;
            if (id === 'CAT_MORE') {
              console.log('[ACTION] Usuario pidió ver más categorías.');
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

          let catId: number | undefined;
          if (msg.type === 'interactive' && msg.interactive?.type === 'list_reply') {
            const id = msg.interactive.list_reply.id;
            if (id.startsWith('CAT_')) {
              catId = +id.replace('CAT_', '');
              console.log(`[ACTION] Categoría seleccionada: ${catId}`);
            }
          } else {
            const idx = Number(text);
            if (!Number.isNaN(idx) && idx >= 1 && idx <= cats.length) {
              catId = cats[idx - 1].id;
              console.log(`[ACTION] Categoría seleccionada por índice: ${catId}`);
            } else {
              const found = cats.find((c: any) => c.nombre?.toLowerCase() === text);
              if (found) {
                catId = (found as any).id;
                console.log(`[ACTION] Categoría seleccionada por nombre: ${catId}`);
              }
            }
          }

          if (!catId) {
            console.log('[WARN] Categoría no válida.');
            if (!(msg.type === 'interactive' && msg.interactive?.type === 'list_reply')) {
              await sendText(from, `❓ No entendí "${raw}". Elige o escribe número/nombre de categoría.`);
            }
            break;
          }

          session.categoryId = catId;
          session.dishOffset = 0;
          const platos = await Platillos.findAll({ where: { menuId: catId } });
          if (platos.length === 0) {
            console.log('[ACTION] No hay platillos en esta categoría.');
            await sendText(from, '🚫 No hay platillos en esa categoría. Elige otra.');
            session.step = 'MAIN_MENU';
            break;
          }

          console.log('[ACTION] Mostrando lista de platillos.');
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

        // El resto de pasos pueden seguir con logs similares
        // ...
        
        case 'CONFIRM': {
          console.log('[STEP] CONFIRM');
          if (text.startsWith('s')) {
            console.log('[ACTION] Pedido confirmado.');
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
            console.log('[ACTION] Pedido cancelado.');
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
