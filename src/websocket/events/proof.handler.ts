// websocket/events/proof.handler.ts

import { DeliveriesService } from "../../deliveries/deliveries.service";
import { Socket } from "socket.io";
import { ProofUploadedEvent } from "../interfaces/websocket.interface";

export async function handleProofUploaded(
  client: Socket,
  data: ProofUploadedEvent,
  deliveriesService: DeliveriesService,
) {
  const status = data.proofType === "PICKUP" ? "PICKED_UP" : "DELIVERED";

  let delivery;
  try {
    delivery = await deliveriesService.findOne(data.deliveryId);
  } catch {
    client.emit("error", { code: "DELIVERY_NOT_FOUND", deliveryId: data.deliveryId });
    return;
  }

  // Idempotency: already at or past the target state — ack without re-applying
  const terminalOrPast = ["DELIVERED", "CANCELLED", "FAILED"];
  const alreadyPickedUp = status === "PICKED_UP" && ["PICKED_UP", "IN_TRANSIT", ...terminalOrPast].includes(delivery.status);
  const alreadyDelivered = status === "DELIVERED" && terminalOrPast.includes(delivery.status);

  if (!alreadyPickedUp && !alreadyDelivered) {
    await deliveriesService.updateStatus(data.deliveryId, {
      status,
      proofUrl: data.imageUrl,
    });
  }

  client.emit("PROOF_ACCEPTED_V1", {
    deliveryId: data.deliveryId,
    proofId: `proof_${Date.now()}`,
    proofType: data.proofType,
    acceptedAt: new Date().toISOString(),
  });
}
