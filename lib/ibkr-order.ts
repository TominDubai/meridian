import { IBApi, EventName, SecType, OrderAction, OrderType } from "@stoqey/ib";
import type { Contract, Order } from "@stoqey/ib";

const HOST      = process.env.IBKR_HOST                   ?? "127.0.0.1";
const PORT      = parseInt(process.env.IBKR_PORT          ?? "7496", 10);
const CLIENT_ID = parseInt(process.env.IBKR_ORDER_CLIENT_ID ?? "3",  10);

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

export async function placeIbkrOrder(params: PlaceOrderParams): Promise<OrderResult> {
  return new Promise((resolve, reject) => {
    const ib = new IBApi({ host: HOST, port: PORT });
    let parentOrderId = -1;
    let settled = false;

    const done = (result: OrderResult | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ib.disconnect(); } catch { /* ignore */ }
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    const timer = setTimeout(
      () => done(new Error("Order timed out waiting for IBKR acknowledgement")),
      15_000,
    );

    ib.on(EventName.nextValidId, (orderId: number) => {
      parentOrderId = orderId;
      const contract  = pairToContract(params.pair);
      const action    = params.direction === "LONG" ? OrderAction.BUY  : OrderAction.SELL;
      const oppAction = params.direction === "LONG" ? OrderAction.SELL : OrderAction.BUY;

      const parent: Order = {
        orderId:       parentOrderId,
        action,
        totalQuantity: params.quantity,
        orderType:     params.limitPrice ? OrderType.LMT : OrderType.MKT,
        ...(params.limitPrice ? { lmtPrice: params.limitPrice } : {}),
        transmit: false,
        tif: "GTC",
      };

      const sl: Order = {
        orderId:       parentOrderId + 1,
        action:        oppAction,
        totalQuantity: params.quantity,
        orderType:     OrderType.STP,
        auxPrice:      params.stopLoss,
        parentId:      parentOrderId,
        transmit:      false,
        tif:           "GTC",
      };

      const tp: Order = {
        orderId:       parentOrderId + 2,
        action:        oppAction,
        totalQuantity: params.quantity,
        orderType:     OrderType.LMT,
        lmtPrice:      params.takeProfit,
        parentId:      parentOrderId,
        transmit:      true,
        tif:           "GTC",
      };

      ib.placeOrder(parentOrderId,     contract, parent);
      ib.placeOrder(parentOrderId + 1, contract, sl);
      ib.placeOrder(parentOrderId + 2, contract, tp);
    });

    ib.on(EventName.orderStatus, (orderId: number, status: string) => {
      if (orderId === parentOrderId && ["Submitted", "PreSubmitted", "Filled"].includes(status)) {
        done({ parentOrderId, status });
      }
    });

    ib.on(EventName.error, (err: Error, code: number, reqId: number) => {
      if (code >= 2100 && code < 2200) return;
      if (reqId === parentOrderId || reqId === parentOrderId + 1 || reqId === parentOrderId + 2 || reqId === -1) {
        done(new Error(`IBKR error ${code}: ${err?.message ?? String(err)}`));
      }
    });

    ib.connect(CLIENT_ID);
  });
}

export async function cancelIbkrOrder(ibkrOrderId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ib = new IBApi({ host: HOST, port: PORT });
    let settled = false;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ib.disconnect(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve();
    };

    const timer = setTimeout(() => done(new Error("Cancel timed out")), 10_000);

    ib.on(EventName.connected, () => {
      ib.cancelOrder(ibkrOrderId);
      setTimeout(() => done(), 500);
    });

    ib.on(EventName.error, (err: Error, code: number) => {
      if (code >= 2100 && code < 2200) return;
      done(new Error(`${code}: ${err?.message}`));
    });

    ib.connect(CLIENT_ID);
  });
}
