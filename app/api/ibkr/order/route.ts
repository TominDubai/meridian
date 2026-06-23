import { getIbkrOrders, insertIbkrOrder } from "@/lib/db";
import { placeIbkrOrder, lotsToUnits } from "@/lib/ibkr-order";

export async function GET() {
  try {
    return Response.json(getIbkrOrders(50));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      pair: string;
      direction: "LONG" | "SHORT";
      lots: number;
      stopLoss: number;
      takeProfit: number;
      limitPrice?: number;
    };

    const { pair, direction, lots, stopLoss, takeProfit, limitPrice } = body;
    if (!pair || !direction || !lots || !stopLoss || !takeProfit) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!["LONG", "SHORT"].includes(direction)) {
      return Response.json({ error: "direction must be LONG or SHORT" }, { status: 400 });
    }

    const quantity = lotsToUnits(lots);
    const result   = await placeIbkrOrder({ pair, direction, quantity, stopLoss, takeProfit, limitPrice });

    const dbId = insertIbkrOrder({
      ibkr_order_id: result.parentOrderId,
      pair, direction,
      order_type:  limitPrice ? "LMT" : "MKT",
      quantity,
      limit_price: limitPrice ?? null,
      stop_loss:   stopLoss,
      take_profit: takeProfit,
      status:      result.status,
      filled_price: null,
      error_msg:   null,
      trade_id:    null,
    });

    return Response.json({ id: dbId, ibkr_order_id: result.parentOrderId, status: result.status });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
