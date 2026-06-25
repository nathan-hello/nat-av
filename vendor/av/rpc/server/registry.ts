import type { Rpc } from "@av/types";

export class RpcPeerRegistry<
  ContextType extends Rpc.Server.Context = Rpc.Server.Context,
> {
  private peers = new WeakMap<Rpc.WebSocket.Peer, ContextType>();

  constructor(
    private peerToContext?: (peer: Rpc.WebSocket.Peer) => ContextType,
  ) {}

  open(peer: Rpc.WebSocket.Peer): ContextType {
    const context =
      this.peerToContext ?
        this.peerToContext(peer)
        // TSAS: The default context always satisfies Rpc.Server.Context.
      : ({ addr: peer.addr, name: peer.addr } as ContextType);
    this.peers.set(peer, context);
    return context;
  }

  get(peer: Rpc.WebSocket.Peer): ContextType {
    const context = this.peers.get(peer);
    if (!context) {
      throw new Error(`missing rpc peer context for ${peer.addr}`);
    }

    return context;
  }

  close(peer: Rpc.WebSocket.Peer) {
    this.peers.delete(peer);
  }
}
