import { describe, expect, it } from "vitest";
import { createGameHandler, Receipt, Store } from "../supabase/functions/_shared/game/handler";
import { GameError, GameState } from "../supabase/functions/_shared/game/model";
import { bestLineup, clubs } from "../supabase/functions/_shared/game/data";
function setup() {
  let state:GameState|null=null, version=0;
  const receipts=new Map<string,{hash:string;receipt:Receipt}>();
  const store:Store={
    async read(id,hash){
      const old=id?receipts.get(id):undefined;
      if(old&&old.hash!==hash)throw new GameError("REQUEST_ID_REUSED");
      return {state:structuredClone(state),version,receipt:old?.receipt};
    },
    async commit(input){
      const old=receipts.get(input.requestId);
      if(old){if(old.hash!==input.commandHash)throw new GameError("REQUEST_ID_REUSED");return old.receipt;}
      if(input.expectedVersion!==version)throw new GameError("STALE_VERSION");
      state=structuredClone(input.state);version++;
      const receipt={version,view:input.view};receipts.set(input.requestId,{hash:input.commandHash,receipt});
      return receipt;
    }
  };
  const handler=createGameHandler({origins:["https://game.example"],authenticate:async token=>token==="valid"?store:null,seed:()=>"test-root-secret"});
  const request=(body?:unknown,token="valid")=>new Request("https://api.example/game",{method:body===undefined?"GET":"POST",headers:{"origin":"https://game.example","authorization":"Bearer "+token,"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  return {handler,request,snapshot:()=>({state,version})};
}
describe("game HTTP boundary",()=>{
  it("rejects unauthenticated users, origins, oversized streams and forged inputs",async()=>{
    const {handler,request}=setup();
    expect((await handler(request(undefined,"bad"))).status).toBe(401);
    expect((await handler(new Request("https://api.example/game",{headers:{origin:"https://evil.example"}}))).status).toBe(403);
    expect((await handler(request({data:"x".repeat(9000)}))).status).toBe(413);
    expect((await handler(request({requestId:crypto.randomUUID(),expectedVersion:0,command:{type:"initialize",clubId:clubs[0].id,reputation:100}}))).status).toBe(400);
  });
  it("replays lost responses and advances once under competing requests",async()=>{
    const {handler,request,snapshot}=setup();
    const init={requestId:crypto.randomUUID(),expectedVersion:0,command:{type:"initialize",clubId:clubs[0].id}};
    const first=await (await handler(request(init))).json(), replay=await (await handler(request(init))).json();
    expect(replay.game).toEqual(first.game);expect(replay.replayed).toBe(true);
    expect(snapshot().version).toBe(1);expect(snapshot().state!.reputation).toBe(20);
    expect((await handler(request({...init,command:{type:"initialize",clubId:clubs[1].id}}))).status).toBe(409);
    const command={type:"start",season:1,round:1,formation:"4-4-2",tactic:"balanced",lineup:bestLineup(clubs[0],"4-4-2")};
    const responses=await Promise.all([1,2].map(()=>handler(request({requestId:crypto.randomUUID(),expectedVersion:1,command}))));
    expect(responses.map(r=>r.status).sort()).toEqual([200,409]);expect(snapshot().version).toBe(2);
    const view=await (await handler(request())).json();
    expect(JSON.stringify(view)).not.toContain("test-root-secret");expect(JSON.stringify(view)).not.toContain('"roll":');
    const old=await (await handler(request(init))).json();
    expect(old.game).toEqual(first.game);expect(old.version).toBe(1);
  });
  it("returns storage failure without false success",async()=>{
    const handler=createGameHandler({origins:[],authenticate:async()=>({read:async()=>({state:null,version:0}),commit:async()=>{throw new Error("db failed");}})});
    const response=await handler(new Request("https://api.example/game",{method:"POST",headers:{"authorization":"Bearer valid","content-type":"application/json"},body:JSON.stringify({requestId:crypto.randomUUID(),expectedVersion:0,command:{type:"initialize",clubId:clubs[0].id}})}));
    expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain("db failed");
  });
});
