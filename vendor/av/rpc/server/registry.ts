import type { Rpc } from "@av/types";

export class RpcPeerRegistry<
  ClientIds extends Record<string, string> = Record<string, string>,
> {
  private peers = new WeakMap<
    Rpc.WebSocket.Peer,
    Rpc.Server.Context<ClientIds[keyof ClientIds]>
  >();

  constructor(private clientIds?: ClientIds) {}

  open(
    peer: Rpc.WebSocket.Peer,
  ): Rpc.Server.Context<ClientIds[keyof ClientIds]> {
    const context = this.contextFor(peer);
    this.peers.set(peer, context);
    return context;
  }

  get(
    peer: Rpc.WebSocket.Peer,
  ): Rpc.Server.Context<ClientIds[keyof ClientIds]> {
    const context = this.peers.get(peer);
    if (!context) {
      throw new Error(`missing rpc peer context for ${peer.addr}`);
    }

    return context;
  }

  close(peer: Rpc.WebSocket.Peer) {
    this.peers.delete(peer);
  }

  private contextFor(
    peer: Rpc.WebSocket.Peer,
  ): Rpc.Server.Context<ClientIds[keyof ClientIds]> {
    return {
      addr: peer.addr,
      clientId: this.resolveClientId(peer.addr),
    };
  }

  private resolveClientId(addr: string): ClientIds[keyof ClientIds] {
    if (!this.clientIds) {
      // TSAS: The default registry mode uses the peer address as the stable id.
      return addr as ClientIds[keyof ClientIds];
    }

    if (!(addr in this.clientIds)) {
      throw new Error(`unknown rpc client address: ${addr}`);
    }

    // TSAS: The runtime membership check above guarantees this address exists in the registry.
    const key = addr as keyof ClientIds;
    return this.clientIds[key];
  }
}
