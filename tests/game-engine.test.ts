import { describe, expect, it } from "vitest";
import { clubs, bestLineup, cpuSelection, getClub, strength } from "../supabase/functions/_shared/game/data";
import { confidence, offers, reputationDelta, schedule, seasonBonus, table } from "../supabase/functions/_shared/game/competition";
import { initialize, nextShot, publicView, transition } from "../supabase/functions/_shared/game/engine";
import { GameState, Result } from "../supabase/functions/_shared/game/model";
import { random, poisson } from "../supabase/functions/_shared/game/random";
import { automaticConversion, conversion, expectedGoals, simulateMatch } from "../supabase/functions/_shared/game/simulation";
import { parseRequest } from "../supabase/functions/_shared/game/contracts";
function start(s: GameState) {
  return transition(s, { type: "start", season: s.season, round: s.round, formation: "4-4-2", tactic: "balanced", lineup: bestLineup(getClub(s.clubId), "4-4-2") });
}
function complete(s: GameState) {
  while (s.phase !== "finished") { s = start(s); if (s.phase === "playing") s = transition(s, { type: "auto", season: s.season, round: s.round }); }
  return s;
}
describe("dataset and calendar", () => {
  it("has 144 valid players and agreed club tiers and bands", () => {
    expect(clubs).toHaveLength(8);
    expect(new Set(clubs.flatMap(c => c.players.map(p => p.id))).size).toBe(144);
    expect(clubs.map(c => c.tier)).toEqual(["low","low","low","medium","medium","medium","high","high"]);
    for (const c of clubs) {
      expect(c.players).toHaveLength(18); expect(c.players.filter(p => p.position === "GK")).toHaveLength(2);
      const [min, max] = c.tier === "low" ? [45,54] : c.tier === "medium" ? [55,64] : [65,74];
      expect(c.reference).toBeGreaterThanOrEqual(min); expect(c.reference).toBeLessThanOrEqual(max);
      for (const p of c.players) for (const value of [p.attack,p.defense,p.saves]) {
        expect(value).toBeGreaterThanOrEqual(1); expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
  it("builds 14 rounds, 56 unique fixtures and each ordered pairing once", () => {
    for (let i=0;i<20;i++) {
      const fixtures = schedule("seed"+i, 1);
      expect(fixtures).toHaveLength(56); expect(new Set(fixtures.map(f=>f.id)).size).toBe(56);
      expect(new Set(fixtures.map(f=>f.home+"/"+f.away)).size).toBe(56);
      for(let r=1;r<=14;r++) expect(new Set(fixtures.filter(f=>f.round===r).flatMap(f=>[f.home,f.away])).size).toBe(8);
      for(const c of clubs) {
        expect(fixtures.filter(f=>f.home===c.id)).toHaveLength(7); expect(fixtures.filter(f=>f.away===c.id)).toHaveLength(7);
      }
    }
  });
  it("rejects duplicate players, outsiders, wrong positions and high initial clubs", () => {
    const c=clubs[0], lineup=bestLineup(c,"4-4-2");
    expect(()=>strength(c,{formation:"4-4-2",tactic:"balanced",lineup:Array(11).fill(lineup[0])})).toThrow("INVALID_LINEUP");
    expect(()=>strength(c,{formation:"4-4-2",tactic:"balanced",lineup:bestLineup(clubs[1],"4-4-2")})).toThrow("INVALID_LINEUP");
    expect(()=>strength(c,{formation:"4-3-3",tactic:"balanced",lineup})).toThrow("INVALID_LINEUP");
    expect(()=>initialize(clubs[7].id,"seed")).toThrow("INITIAL_CLUB_MUST_BE_LOW");
  });
});
describe("probability and progression", () => {
  it("applies tactics, confidence, local advantage and xG bounds", () => {
    const c=clubs[0], lineup=bestLineup(c,"4-4-2");
    const base=strength(c,{formation:"4-4-2",tactic:"balanced",lineup});
    const attack=strength(c,{formation:"4-4-2",tactic:"offensive",lineup},0.06);
    expect(attack.attack).toBeCloseTo(base.attack*1.15*1.06);
    expect(attack.defense).toBeCloseTo(base.defense*0.85*1.06);
    expect(expectedGoals(60,60,true)).toBeCloseTo(1.43);
    expect(expectedGoals(10000,1,true)).toBe(3.5); expect(expectedGoals(1,10000,false)).toBe(0.2);
  });
  it("implements agreed shot precision, ratings, keeper prediction and clamps", () => {
    expect(conversion(60,60,0,false)).toBeCloseTo(.3);
    expect(conversion(60,60,50,false)).toBeCloseTo(.5);
    expect(conversion(60,60,100,false)).toBeCloseTo(.7);
    expect(conversion(80,60,100,false)).toBeCloseTo(.76);
    expect(conversion(80,60,100,true)).toBeCloseTo(.56);
    expect(conversion(1,100,0,true)).toBe(.1); expect(conversion(100,1,100,false)).toBe(.9);
    expect(automaticConversion(60,60)).toBeCloseTo(.5-.2/3,3);
  });
  it("keeps Poisson average close to expectation", () => {
    const rng=random("poisson"), n=20000; let sum=0;
    for(let i=0;i<n;i++)sum+=poisson(1.82,rng);
    expect(sum/n).toBeGreaterThan(1.77); expect(sum/n).toBeLessThan(1.87);
  });
  it("confidence remembers five games and caps at six percent", () => {
    const results: Result[]=Array.from({length:6},(_,i)=>({id:"r"+i,round:i+1,home:clubs[0].id,away:clubs[1].id,homeGoals:i===0?0:1,awayGoals:0}));
    expect(confidence(clubs[0].id,results)).toBe(.06); expect(confidence(clubs[1].id,results)).toBe(-.06); expect(confidence(clubs[2].id,results)).toBe(0);
  });
  it("uses fixed reference, objectives and offer eligibility", () => {
    const upset:Result={id:"x",round:1,home:clubs[0].id,away:clubs[7].id,homeGoals:1,awayGoals:0};
    expect(reputationDelta(clubs[0].id,upset)).toBe(3); expect(reputationDelta(clubs[7].id,upset)).toBe(-2);
    expect(seasonBonus(clubs[0].id,4)).toBe(5); expect(seasonBonus(clubs[0].id,6)).toBe(3); expect(seasonBonus(clubs[0].id,7)).toBe(-2);
    const standings=table([],"ties",1); for(const r of standings)r.rank=8;
    const proposals=offers(clubs[0].id,20,standings,"offers",1);
    expect(proposals.length).toBeLessThanOrEqual(2);
    expect(proposals.every(id=>getClub(id).tier==="low" && id!==clubs[0].id)).toBe(true);
    expect(offers(clubs[0].id,0,standings,"offers",1)).toEqual([]);
  });
  it("ranks points, goal difference, goals, wins then stable lottery", () => {
    const results:Result[]=[
      {id:"a",round:1,home:"club-0",away:"club-1",homeGoals:2,awayGoals:0},
      {id:"b",round:1,home:"club-2",away:"club-3",homeGoals:3,awayGoals:1},
      {id:"c",round:1,home:"club-4",away:"club-5",homeGoals:1,awayGoals:0}
    ];
    expect(table(results,"seed",1).slice(0,3).map(r=>r.clubId)).toEqual(["club-2","club-0","club-4"]);
    expect(table([],"seed",1)).toEqual(table([],"seed",1));
  });
});
describe("match lifecycle", () => {
  it("reproduces a season from the same seed and decisions", () => {
    const a=complete(initialize("club-0","repeat"));
    expect(complete(initialize("club-0","repeat"))).toEqual(a);
    expect(complete(initialize("club-0","different")).results).not.toEqual(a.results);
  });
  it("limits control to two chances and hides future outcomes and random state", () => {
    let seen=0;
    for(let i=0;i<40;i++){
      const state=start(initialize("club-0","private"+i));
      expect((state.pending?.flatMap(m=>m.shots).filter(s=>s.controlled)??[]).length).toBeLessThanOrEqual(2);
      if(state.phase==="playing"){
        seen++; expect(state.results).toHaveLength(0); expect(state.reputation).toBe(20);
        const view=publicView(state), serialized=JSON.stringify(view);
        for(const key of ['"seed":','"keeper":','"roll":','"automaticPrecision":'])expect(serialized).not.toContain(key);
        const s=nextShot(state)!; expect(view.match!.pendingEvent!.id).toBe(s.id);
        const after=transition(state,{type:"shoot",season:1,round:1,eventId:s.id,direction:"left",precision:80});
        expect(()=>transition(after,{type:"shoot",season:1,round:1,eventId:s.id,direction:"right",precision:100})).toThrow();
        expect(nextShot(state)!.resolved).toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(30);
  });
  it("keeps the finished user match visible after the round closes", () => {
    let immediate=0, played=0;
    for(let i=0;i<200;i++){
      let state=start(initialize("club-0","last"+i));
      if(state.phase==="playing"){
        played++;
        while(state.phase==="playing") state=transition(state,{type:"shoot",season:1,round:1,eventId:nextShot(state)!.id,direction:"left",precision:50});
      } else immediate++;
      const view=publicView(state), own=state.results.find(r=>r.home==="club-0"||r.away==="club-0")!;
      expect(view.match).toBeNull();
      expect(view.lastMatch).toMatchObject({ id: own.id, round: 1, homeGoals: own.homeGoals, awayGoals: own.awayGoals, pendingEvent: null });
      expect(view.lastMatch!.events).toHaveLength(state.lastMatch!.shots.length);
      const serialized=JSON.stringify(view.lastMatch);
      for(const key of ['"keeper":','"roll":','"automaticPrecision":'])expect(serialized).not.toContain(key);
    }
    // Both paths must be exercised: a round with no controllable chance closes on start.
    expect(immediate).toBeGreaterThan(0); expect(played).toBeGreaterThan(0);
  });
  it("clears the last match on a new season and accepts states saved without it", () => {
    const finished=complete(initialize("club-0","season-end"));
    expect(publicView(finished).lastMatch!.round).toBe(14);
    expect(publicView(transition(finished,{type:"nextSeason",season:1,offerClubId:null})).lastMatch).toBeNull();
    const legacy=initialize("club-0","legacy"); delete legacy.lastMatch;
    expect(publicView(legacy).lastMatch).toBeNull();
  });
  it("finishes once and preserves reputation and history when staying or moving", () => {
    const finished=complete(initialize("club-0","career"));
    expect(finished.results).toHaveLength(56); expect(finished.round).toBe(15);
    const standings=table(finished.results,finished.seed,finished.season);
    expect(standings.every(r=>r.played===14)).toBe(true);
    expect(standings.reduce((s,r)=>s+r.for,0)).toBe(standings.reduce((s,r)=>s+r.against,0));
    const next=transition(finished,{type:"nextSeason",season:1,offerClubId:null});
    expect(next.reputation).toBe(finished.reputation); expect(next.history).toHaveLength(1);
    expect(next.results).toEqual([]); expect(next.season).toBe(2); expect(publicView(next).confidence["club-0"]).toBe(0);
    expect(()=>transition(next,{type:"nextSeason",season:1,offerClubId:null})).toThrow("STALE_SEASON");
    expect(()=>transition(finished,{type:"nextSeason",season:1,offerClubId:"club-0"})).toThrow("INVALID_OFFER");
    if(finished.offers.length) expect(transition(finished,{type:"nextSeason",season:1,offerClubId:finished.offers[0]}).clubId).toBe(finished.offers[0]);
  });
  it("automatic scores vary and match the expected goal budget statistically", () => {
    const h=clubs[7], a=clubs[0], n=2500;
    let home=0, away=0, hxg=0, axg=0, wins=0, losses=0; const scores=new Set<string>();
    for(let i=0;i<n;i++){
      const m=simulateMatch({id:"balance-"+i,round:1,home:h.id,away:a.id},h,a,
        cpuSelection(h,a,random("h"+i)),cpuSelection(a,h,random("a"+i)),0,0,"balance","none");
      const hg=m.shots.filter(s=>s.clubId===h.id&&s.goal).length, ag=m.shots.filter(s=>s.clubId===a.id&&s.goal).length;
      home+=hg;away+=ag;hxg+=m.homeExpected;axg+=m.awayExpected;
      wins+=Number(hg>ag);losses+=Number(hg<ag);scores.add(hg+"-"+ag);
    }
    expect(Math.abs(home/n-hxg/n)).toBeLessThan(.12); expect(Math.abs(away/n-axg/n)).toBeLessThan(.12);
    expect(wins).toBeGreaterThan(losses);expect(losses).toBeGreaterThan(100);expect(scores.size).toBeGreaterThan(20);
  });
});
it("rejects forged fields, NaN and invalid rounds at the command boundary",()=>{
  const wrap=(command:unknown)=>({requestId:"10000000-0000-4000-8000-000000000001",expectedVersion:0,command});
  expect(()=>parseRequest(wrap({type:"initialize",clubId:"club-0",reputation:100}))).toThrow();
  expect(()=>parseRequest(wrap({type:"shoot",season:1,round:1,eventId:"x",direction:"left",precision:NaN}))).toThrow();
  expect(()=>parseRequest(wrap({type:"auto",season:1,round:15}))).toThrow();
  expect(()=>parseRequest({...wrap({type:"auto",season:1,round:1}),userId:"forged"})).toThrow();
});
