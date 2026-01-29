// websocket/events/proof.handler.ts

import { DeliveriesService } from '../../deliveries/deliveries.service';
import { Socket } from 'socket.io';
import { ProofUploadedEvent } from '../interfaces/websocket.interface';

export async function handleProofUploaded(
  client: Socket,
  data: ProofUploadedEvent,
  deliveriesService: DeliveriesService,
) {
  const status =
    data.proofType === 'PICKUP' ? 'PICKED_UP' : 'DELIVERED';

  await deliveriesService.updateStatus(data.deliveryId, {
    status,
    proofUrl: data.imageUrl,
  });

  client.emit('PROOF_ACCEPTED_V1', {
    deliveryId: data.deliveryId,
    proofId: `proof_${Date.now()}`,
    proofType: data.proofType,
    acceptedAt: new Date().toISOString(),
  });
}
