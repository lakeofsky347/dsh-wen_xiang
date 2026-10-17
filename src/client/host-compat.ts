import type { ClientRpc, RpcResult } from '../shared/protocol.ts';

/** Only the Connection members used by this plugin; newer host members stay host-owned. */
export interface ClientConnection {
  rpc:ClientRpc;
  generation?:{
    getSnapshot():{readonly id:number}|undefined;
    subscribe(listener:()=>void):()=>void;
  };
}

const connectionChanged=()=>new Error('DSH 连接已中断或更新，提交结果尚未确认。恢复连接后请先检查当前结果；提交不会自动重试。');

/** Reject old-generation results even when a carrier settles after cancellation. */
export class ClientConnectionScope implements ClientRpc {
  private abort=new AbortController();
  private disposed=false;
  private available:boolean;
  constructor(private readonly connection:ClientConnection) {
    this.available=connection.generation===undefined||connection.generation.getSnapshot()!==undefined;
  }
  get signal():AbortSignal {return this.abort.signal;}
  call(channel:string,endpoint:string,payload:unknown,signal?:AbortSignal):Promise<RpcResult> {
    if(this.disposed||!this.available)return Promise.reject(connectionChanged());
    const generation=this.abort.signal;
    if(signal?.aborted)return Promise.reject(signal.reason);
    return new Promise<RpcResult>((resolve,reject)=>{
      const request=new AbortController();
      const cleanup=()=>{generation.removeEventListener('abort',abortGeneration);signal?.removeEventListener('abort',abortCaller);};
      const cancel=(reason:unknown)=>{cleanup();request.abort(reason);reject(reason);};
      const abortGeneration=()=>cancel(generation.reason);
      const abortCaller=()=>cancel(signal?.reason);
      generation.addEventListener('abort',abortGeneration,{once:true});
      signal?.addEventListener('abort',abortCaller,{once:true});
      try {
        void this.connection.rpc.call(channel,endpoint,payload,request.signal).then(
          response=>{cleanup();if(generation.aborted)reject(generation.reason);else if(signal?.aborted)reject(signal.reason);else resolve(response);},
          error=>{cleanup();reject(error);},
        );
      } catch(error) {cleanup();reject(error);}
    });
  }
  /** Observe readiness on current hosts, or the established reset event on older hosts. */
  watch(on:(event:string,listener:()=>void)=>()=>void,changed:(available:boolean,reset:boolean)=>void):()=>void {
    const generation=this.connection.generation;
    let active=true;
    const replace=(available:boolean)=>{
      if(!active||this.disposed)return;
      this.abort.abort(connectionChanged());
      this.abort=new AbortController();
      this.available=available;
      changed(available,true);
    };
    if(generation!==undefined){
      let current=generation.getSnapshot();
      const sync=()=>{
        const next=generation.getSnapshot();
        if(next?.id===current?.id)return;
        current=next;replace(next!==undefined);
      };
      const unsubscribe=generation.subscribe(sync);
      this.available=current!==undefined;
      changed(this.available,false);
      sync();
      return ()=>{active=false;unsubscribe();};
    }
    const unsubscribe=on('connection/reset',()=>replace(true));
    changed(true,false);
    return ()=>{active=false;unsubscribe();};
  }
  dispose():void {
    if(this.disposed)return;
    this.disposed=true;this.abort.abort(connectionChanged());
  }
}
