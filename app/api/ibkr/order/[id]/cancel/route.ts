import { getIbkrOrderById, updateIbkrOrderStatus } from "@/lib/db";
import { cancelIbkrOrder } from "@/lib/ibkr-order";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const dbId = parseInt(id, 10);
    const order = getIbkrOrderById(dbId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    if (!order.ibkr_order_id) return Response.json({ error: "No IBKR order ID on record" }, { status: 400 });

    await cancelIbkrOrder(order.ibkr_order_id);
    updateIbkrOrderStatus(dbId, "Cancelled");

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
