import { IBApi, EventName, SecType, OrderAction, OrderType } from "@stoqey/ib";
import type { Contract, Order } from "@stoqey/ib";

const HOST      = process.env.IBKR_HOST                     ?? "127.0.0.1";
const PORT      = parseInt(process.env.IBKR_PORT            ?? "7496", 10);
const CLIENT_ID = parseInt(process.env.IBKR_ORDER_CLIENT_ID ?? "3",    10);

export function lotsToUnits(lots: number): number {
  return Math.round(lots * 100_000);
}

function pairToContract(pair: string): Contract {
  return {
    symbol:   pair.slice(0, 3),
    secType:  SecType.CASH,
    currency: pair.slice(3),
    exchange: "IDEALPRO",
  };
}

function roundToTick(price: number, pair: string): number {
  // IBKR rejects prices off the contract's min tick (error 110).
  // IDEALPRO: JPY-quoted pairs tick 0.005 (3dp); other majors 0.00005 (5dp).
  const jpy = pair.slice(3) === "JPY";
  const tick = jpy ? 0.005 : 0.00005;
  const decimals = jpy ? 3 : 5;
  return parseFloat((Math.round(price / tick) * tick).toFixed(decimals));
}

export interface PlaceOrderParams {
  pair:        string;
  direction:   "LONG" | "SHORT";
  quantity:    number;       // base currency units (lotsToUnits(0.1) = 10_000)
  stopLoss:    number;
  takeProfit:  number;
  limitPrice?: number;       // omit → MKT
}

export interface OrderResult {
  parentOrderId: number;
  status:        string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent singleton IBKR order connection.
//
// The original implementation opened a NEW IBApi per order and disconnected
// inside done(), and resolved on the transient "PreSubmitted" status. Two bugs:
//   1. Disconnecting per order is fragile and loses fill/exec callbacks.
//   2. Resolving on PreSubmitted reported SUCCESS ~270 ms before IBKR's actual
//      rejection (error 201 "Order increases leveraged FX position") landed, so
//      a rejected order looked like a placed, protected trade.
//
// This module keeps ONE long-lived connection (order client id 3) for the life
// of the meridian-app process. It connects on first use, auto-reconnects on drop
// (socket close / nightly IBKR reset) with backoff, and NEVER disconnects after
// placing. It resolves ONLY on a definitive working/filled status (Submitted or
// Filled) and REJECTS on IBKR rejection/cancellation, so the strategy's
// try/catch correctly records a failure instead of a phantom trade. GTC orders
// live server-side, so an accepted bracket persists across brief reconnects.
// ─────────────────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[ibkr-order] ${new Date().toISOString()}  ${msg}`);
}

let ib: IBApi | null = null;
let connected = false;          // true once nextValidId received (ready to place)
let nextOrderId = -1;           // monotonic local order-id counter, seeded by nextValidId
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 2_000;
const MAX_RECONNECT_DELAY = 60_000;

interface ReadyWaiter { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; }
let readyWaiters: ReadyWaiter[] = [];

interface Pending {
  resolve:   (r: OrderResult) => void;
  reject:    (e: Error) => void;
  timer:     ReturnType<typeof setTimeout>;          // overall ack timeout
  failTimer: ReturnType<typeof setTimeout> | null;   // grace timer after an Inactive/Cancelled status
  ids:       number[];                               // [parent, sl, tp]
}
const pending = new Map<number, Pending>();   // keyed by parentOrderId

function clearPending(parentOrderId: number) {
  const p = pending.get(parentOrderId);
  if (!p) return;
  clearTimeout(p.timer);
  if (p.failTimer) clearTimeout(p.failTimer);
  pending.delete(parentOrderId);
}

function resolvePending(parentOrderId: number, result: OrderResult) {
  const p = pending.get(parentOrderId);
  if (!p) return;
  clearPending(parentOrderId);
  p.resolve(result);
}

function rejectPending(parentOrderId: number, err: Error) {
  const p = pending.get(parentOrderId);
  if (!p) return;
  clearPending(parentOrderId);
  p.reject(err);
}

function flushReadyWaiters() {
  const ws = readyWaiters;
  readyWaiters = [];
  for (const w of ws) { clearTimeout(w.timer); w.resolve(); }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  log(`reconnecting in ${reconnectDelay / 1000}s…`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

function connect() {
  if (ib) { try { ib.disconnect(); } catch { /* ignore */ } ib = null; }
  connected = false;
  log(`connecting to IB Gateway ${HOST}:${PORT} (orderClientId=${CLIENT_ID})…`);

  const api = new IBApi({ host: HOST, port: PORT });
  ib = api;

  api.on(EventName.nextValidId, (orderId: number) => {
    nextOrderId = Math.max(nextOrderId, orderId);
    connected = true;
    reconnectDelay = 2_000;             // reset backoff on success
    log(`connected — nextValidId=${orderId}`);
    flushReadyWaiters();
  });

  api.on(EventName.connected, () => log("socket connected"));

  api.on(EventName.disconnected, () => {
    connected = false;
    log("disconnected from IB Gateway");
    scheduleReconnect();
  });

  api.on(EventName.orderStatus, (orderId: number, status: string) => {
    const p = pending.get(orderId);    // only parent ids are keys
    if (!p) return;
    if (status === "Filled" || status === "Submitted") {
      // Definitive working/filled state → genuine success.
      resolvePending(orderId, { parentOrderId: orderId, status });
    } else if (status === "Inactive" || status === "Cancelled" || status === "ApiCancelled") {
      // Almost certainly a rejection. Give the error event a beat to supply the
      // reason; if no rejection arrives, fail generically so we never report a
      // phantom trade.
      if (!p.failTimer) {
        p.failTimer = setTimeout(() => {
          rejectPending(orderId, new Error(`Order ${orderId} became ${status} (rejected by IBKR)`));
        }, 1_200);
      }
    }
    // "PreSubmitted" is transient — wait for it to progress to Submitted/Filled
    // or fail. We intentionally do NOT resolve on it (that was the old bug).
  });

  api.on(EventName.error, (err: Error, code: number, reqId: number) => {
    if (code === 399 || (code >= 2100 && code < 2200)) return; // 399 odd-lot warning + informational notices
    if (code === 1100) { connected = false; return; }          // connectivity lost (reconnect via disconnected)
    if (code === 1101 || code === 1102) { return; }            // connectivity restored
    // Match the error to a pending placement by reqId (IBKR sends order
    // rejections — e.g. 201 — and cancellations — 202 — with reqId = orderId).
    for (const [pid, p] of pending) {
      if (p.ids.includes(reqId)) {
        rejectPending(pid, new Error(`IBKR error ${code}: ${err?.message ?? String(err)}`));
        return;
      }
    }
    log(`error code=${code} reqId=${reqId}: ${err?.message ?? String(err)}`);
  });

  api.connect(CLIENT_ID);
}

function ready(timeoutMs = 12_000): Promise<void> {
  if (connected && ib) return Promise.resolve();
  if (!ib && !reconnectTimer) connect();        // kick off a connection if none in progress
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      readyWaiters = readyWaiters.filter((w) => w.timer !== timer);
      reject(new Error("Timed out connecting to IBKR order gateway"));
    }, timeoutMs);
    readyWaiters.push({ resolve, reject, timer });
  });
}

export async function placeIbkrOrder(params: PlaceOrderParams): Promise<OrderResult> {
  await ready();
  const api = ib;
  if (!api) throw new Error("IBKR order connection unavailable");

  const parentOrderId = nextOrderId;
  nextOrderId += 3;                                // reserve parent, sl, tp

  const contract  = pairToContract(params.pair);
  const action    = params.direction === "LONG" ? OrderAction.BUY  : OrderAction.SELL;
  const oppAction = params.direction === "LONG" ? OrderAction.SELL : OrderAction.BUY;

  const parent: Order = {
    orderId:       parentOrderId,
    action,
    totalQuantity: params.quantity,
    orderType:     params.limitPrice ? OrderType.LMT : OrderType.MKT,
    ...(params.limitPrice ? { lmtPrice: roundToTick(params.limitPrice, params.pair) } : {}),
    transmit: false,
    tif: "GTC",
  };

  const sl: Order = {
    orderId:       parentOrderId + 1,
    action:        oppAction,
    totalQuantity: params.quantity,
    orderType:     OrderType.STP,
    auxPrice:      roundToTick(params.stopLoss, params.pair),
    parentId:      parentOrderId,
    transmit:      false,
    tif:           "GTC",
  };

  const tp: Order = {
    orderId:       parentOrderId + 2,
    action:        oppAction,
    totalQuantity: params.quantity,
    orderType:     OrderType.LMT,
    lmtPrice:      roundToTick(params.takeProfit, params.pair),
    parentId:      parentOrderId,
    transmit:      true,
    tif:           "GTC",
  };

  return new Promise<OrderResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      rejectPending(parentOrderId, new Error("Order timed out waiting for IBKR acknowledgement"));
    }, 15_000);

    pending.set(parentOrderId, {
      resolve, reject, timer, failTimer: null,
      ids: [parentOrderId, parentOrderId + 1, parentOrderId + 2],
    });

    try {
      api.placeOrder(parentOrderId,     contract, parent);
      api.placeOrder(parentOrderId + 1, contract, sl);
      api.placeOrder(parentOrderId + 2, contract, tp);
      // NOTE: connection intentionally left OPEN so the bracket persists and
      // fills/updates keep flowing. No disconnect here — that was the old bug.
    } catch (e) {
      rejectPending(parentOrderId, e as Error);
    }
  });
}

export async function cancelIbkrOrder(ibkrOrderId: number): Promise<void> {
  await ready();
  const api = ib;
  if (!api) throw new Error("IBKR order connection unavailable");

  return new Promise<void>((resolve, reject) => {
    try {
      api.cancelOrder(ibkrOrderId);
    } catch (e) {
      reject(e as Error);
      return;
    }
    // Cancellation is acknowledged asynchronously; give it a moment, then resolve.
    setTimeout(() => resolve(), 800);
  });
}
