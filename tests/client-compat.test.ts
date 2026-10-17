import test from 'node:test';
import assert from 'node:assert/strict';
import { ClientConnectionScope } from '../src/client/host-compat.ts';
import { MemoryController } from '../src/client/memory-controller.ts';
import type { ClientRpc, RpcResult } from '../src/shared/protocol.ts';
import type { MemoryDocument, MemoryStatus } from '../src/shared/memory.ts';

function deferred<T>() {
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(done=>{resolve=done;});
  return {promise,resolve};
}
function generationSource(initial?:{id:number}) {
  let current=initial;
  const listeners=new Set<()=>void>();
  return {
    getSnapshot:()=>current,
    subscribe:(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},
    publish:(next:{id:number}|undefined)=>{current=next;for(const listener of listeners)listener();},
    listeners,
  };
}

test('当前Host代际建立前不发送RPC，重复代际通知不重载，失联后拒绝旧请求且不重放提交',async()=>{
  const generation=generationSource(),pending=deferred<RpcResult>();
  const calls:{endpoint:string;signal?:AbortSignal}[]=[],changes:{available:boolean;reset:boolean}[]=[];
  const scope=new ClientConnectionScope({generation,rpc:{call:async(_channel,endpoint,_payload,signal)=>{calls.push({endpoint,signal});return pending.promise;}}});
  const stop=scope.watch(()=>{throw new Error('现代Connection使用代际observable');},(available,reset)=>changes.push({available,reset}));
  try {
    await assert.rejects(scope.call('/api','meihua/cast',{}),/连接已中断或更新/);
    assert.equal(calls.length,0);
    generation.publish({id:1});generation.publish({id:1});
    const mutation=scope.call('/api','meihua/cast',{}),rejection=assert.rejects(mutation,/提交结果尚未确认/);
    assert.equal(calls.length,1);assert.equal(calls[0]!.signal!.aborted,false);
    generation.publish(undefined);await rejection;
    assert.equal(calls[0]!.signal!.aborted,true);
    generation.publish({id:2});
    pending.resolve({ok:true,value:{id:'old-cast'}});
    await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(calls.length,1,'恢复时仅通知重新读取，不会自动重发cast');
    assert.deepEqual(changes,[{available:false,reset:false},{available:true,reset:true},{available:false,reset:true},{available:true,reset:true}]);
    assert.deepEqual(await scope.call('/api','meihua/current',{}),{ok:true,value:{id:'old-cast'}});
    assert.equal(calls.at(-1)!.endpoint,'meihua/current');
  } finally {stop();scope.dispose();}
  assert.equal(generation.listeners.size,0);
  generation.publish({id:3});assert.equal(changes.length,4);
});

test('旧Host沿用connection/reset，销毁中止未完成RPC并撤销监听',async()=>{
  const pending=deferred<RpcResult>(),listeners=new Map<string,()=>void>();
  let invocations=0,resets=0,signal:AbortSignal|undefined;
  const scope=new ClientConnectionScope({rpc:{call:async(_channel,_endpoint,_payload,value)=>{invocations++;signal=value;return pending.promise;}}});
  const stop=scope.watch((event,listener)=>{listeners.set(event,listener);return ()=>{listeners.delete(event);};},(available,reset)=>{assert.equal(available,true);if(reset)resets++;});
  const old=scope.call('/api','tarot/interpret',{}),rejection=assert.rejects(old,/不会自动重试/);
  listeners.get('connection/reset')!();await rejection;
  assert.equal(signal!.aborted,true);assert.equal(resets,1);assert.equal(invocations,1);
  const next=scope.call('/api','tarot/current',{}),disposed=assert.rejects(next,/连接已中断或更新/);
  stop();scope.dispose();scope.dispose();await disposed;
  assert.equal(signal!.aborted,true);assert.equal(listeners.size,0);
  await assert.rejects(scope.call('/api','tarot/current',{}),/连接已中断或更新/);
  assert.equal(invocations,2);
  pending.resolve({ok:true,value:'late'});
});

test('调用方取消只影响自己的RPC，成功与错误结果保持Host协议',async()=>{
  const first=deferred<RpcResult>(),second=deferred<RpcResult>(),cancel=new AbortController();
  let count=0;
  const scope=new ClientConnectionScope({rpc:{call:async()=>++count===1?first.promise:second.promise}});
  try {
    const a=scope.call('/api','memory/document',{},cancel.signal),rejection=assert.rejects(a,/调用方已取消/);
    const b=scope.call('/api','memory/status',{});
    cancel.abort(new Error('调用方已取消'));await rejection;
    second.resolve({ok:false,error:{code:'FIXTURE',message:'fixture error',details:{}}});
    assert.deepEqual(await b,{ok:false,error:{code:'FIXTURE',message:'fixture error',details:{}}});
    first.resolve({ok:true,value:'ignored'});
    const alreadyAborted=new AbortController();alreadyAborted.abort(new Error('取消前未发送'));
    await assert.rejects(scope.call('/api','memory/save',{},alreadyAborted.signal),/取消前未发送/);
    assert.equal(count,2);
  } finally {scope.dispose();}
});

test('重连清空共享背景与旧epoch，同修订号的新Host文档仍重新读取，旧响应不能恢复缓存',async()=>{
  const status:MemoryStatus={initialized:true,unlocked:true,revision:2,epoch:7,updating:false,pending:false};
  const original:MemoryDocument={content:'旧连接私人内容',revision:2,epoch:7,source:'manual',updatedAt:'',fixedParagraphs:[]};
  const stale=deferred<RpcResult>();
  let content=original,holdStatus=false;
  const signals:AbortSignal[]=[];
  const rpc:ClientRpc={call:async(_channel,endpoint,_payload,signal)=>{
    if(signal)signals.push(signal);
    if(endpoint==='memory/status')return holdStatus?stale.promise:{ok:true,value:status};
    if(endpoint==='memory/document')return {ok:true,value:content};
    if(endpoint==='memory/versions')return {ok:true,value:{versions:[],revision:2,epoch:7}};
    throw new Error(`Unexpected endpoint ${endpoint}`);
  }};
  const memory=new MemoryController(rpc);
  try {
    await memory.load();assert.equal(memory.getSnapshot().document?.content,original.content);
    holdStatus=true;const old=memory.load();memory.resetConnection();
    assert.equal(signals.at(-1)!.aborted,true);
    assert.equal(memory.getSnapshot().status,null);assert.equal(memory.getSnapshot().document,null);assert.deepEqual(memory.getSnapshot().versions,[]);
    assert.equal(memory.getSnapshot().privacyEpoch,1);
    holdStatus=false;content={...original,content:'新连接内容但epoch和revision相同'};
    await memory.load();assert.equal(memory.getSnapshot().document?.content,content.content);
    stale.resolve({ok:true,value:{...status,unlocked:false}});await old;
    assert.equal(memory.getSnapshot().status?.unlocked,true);assert.equal(memory.getSnapshot().document?.content,content.content);
  } finally {memory.dispose();}
});

test('重连后的旧背景修改结果不能重读新Host或解除新操作的busy状态',async()=>{
  const old=deferred<RpcResult>(),next=deferred<RpcResult>();
  let reads=0;
  const memory=new MemoryController({call:async(_channel,endpoint)=>{
    if(endpoint==='memory/initialize')return old.promise;
    if(endpoint==='memory/unlock')return next.promise;
    if(endpoint==='memory/status'){reads++;return {ok:true,value:{initialized:true,unlocked:false,revision:0,epoch:1,updating:false,pending:false}};}
    throw new Error(`Unexpected endpoint ${endpoint}`);
  }});
  try {
    const initial=memory.initialize('synthetic-test-passphrase');memory.resetConnection();
    const replacement=memory.unlock('synthetic-test-passphrase');
    assert.equal(memory.getSnapshot().acting,true);
    old.resolve({ok:true,value:{}});assert.equal(await initial,false);
    assert.equal(reads,0);assert.equal(memory.getSnapshot().acting,true);assert.equal(memory.getSnapshot().notice,'');
    next.resolve({ok:true,value:{}});assert.equal(await replacement,true);
    assert.equal(reads,1);assert.equal(memory.getSnapshot().acting,false);assert.match(memory.getSnapshot().notice,/已解锁/);
  } finally {memory.dispose();}
});
