"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Club, Command, Direction, Selection } from '../../../supabase/functions/_shared/game/model';
import { careerOverview, GameRequestError, readGame, sendDecision, type Decision, type GameSnapshot } from '@/lib/career-game';
import { getSupabase } from '@/lib/supabase';
import { withReference } from '@/lib/functions';
import styles from './career-dashboard.module.css';
import { draftKey, readDraft, saveDraft, tacticLabels, validSelection } from '@/lib/lineup-draft';
import TeamEditor from './team-editor';
import MatchArena, { type ConfirmedShot } from './match-arena';
import MatchNarrative from './match-narrative';

function ClubMark({ club }: { club?: Club }) {
  return <span className={styles.clubMark} aria-label={`Distintivo de ${club?.name ?? 'club'}`}>{club?.name.split(' ').map(n => n[0]).slice(0, 3).join('') ?? '—'}</span>;
}

export default function CareerDashboard({ careerId, managerName, onSignOut }: { careerId: string; managerName: string; onSignOut: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<Decision | null>(null);
  const [tab, setTab] = useState('Central');
  const [direction, setDirection] = useState<Direction>('center');
  const [meter, setMeter] = useState<number | null>(null);
  const [position, setPosition] = useState(50);
  const [draft, setDraft] = useState<{ key: string; value: Selection; persisted: boolean } | null>(null);
  const [shotFeedback, setShotFeedback] = useState<ConfirmedShot | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const autoAfterStart = useRef(false);
  const encounter = useRef<HTMLElement>(null);
  const game = snapshot?.game;
  const club = snapshot?.clubs.find(c => c.id === game?.clubId);
  const clubById = (id: string) => snapshot?.clubs.find(c => c.id === id);
  const name = (id: string) => clubById(id)?.name ?? 'Club no disponible';
  const pendingEventId = game?.match?.pendingEvent?.id;
  const lineupValid = Boolean(club && draft && validSelection(club, draft.value));
  const feedback = shotFeedback && game?.lastMatch?.events.some(e => e.id === shotFeedback.id) || shotFeedback && game?.match?.events.some(e => e.id === shotFeedback.id) ? shotFeedback : null;

  function acceptSnapshot(data: GameSnapshot) {
    setSnapshot(data);
    if (!data.game) { setDraft(null); return; }
    const g = data.game, c = data.clubs.find(item => item.id === g.clubId);
    if (!c) { setDraft(null); return; }
    const key = draftKey(careerId, g.datasetCode, g.season, c.id);
    const ownMatch = g.match ?? g.lastMatch;
    const confirmed = ownMatch ? ownMatch.home === c.id ? ownMatch.homeSelection : ownMatch.awaySelection : undefined;
    setDraft(previous => previous?.key === key ? previous : { key, value: g.phase === 'playing' && confirmed ? confirmed : readDraft(key, c, confirmed), persisted: true });
  }

  function editSelection(value: Selection) {
    if (!draft || busy || pending || game?.phase !== 'ready') return;
    setDraft({ key: draft.key, value, persisted: saveDraft(draft.key, value) });
  }

  useEffect(() => {
    if (pendingEventId && tab === 'Central') encounter.current?.scrollIntoView({ block: 'center' });
  }, [pendingEventId, tab]);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    readGame(getSupabase()!).then(data => { if (!cancelled) acceptSnapshot(data); }).catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'No pudimos cargar la carrera.'); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; alive.current = false; };
    // The dashboard is keyed by career/user. Load once for that mounted identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (meter === null) return;
    let frame: number;
    const tick = (now: number) => { setPosition((1 - Math.abs(((now - meter) / 2000) % 2 - 1)) * 100); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    const pause = () => { if (document.hidden) setMeter(null); };
    document.addEventListener('visibilitychange', pause);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', pause); };
  }, [meter]);

  async function refresh() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(''); setMeter(null);
    try { const data = await readGame(getSupabase()!); if (alive.current) acceptSnapshot(data); }
    catch (error) { if (alive.current) setMessage(error instanceof Error ? error.message : 'No pudimos actualizar.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }

  async function act(command?: Command, simulate = false) {
    if (!snapshot || lock.current) return;
    lock.current = true; setBusy(true); setMessage(''); setMeter(null);
    let decision = pending ?? { requestId: crypto.randomUUID(), expectedVersion: snapshot.version, command: command! };
    if (!pending) autoAfterStart.current = simulate;
    try {
      for (;;) {
        setPending(decision);
        const receipt = await sendDecision(getSupabase()!, decision);
        if (!alive.current) return;
        acceptSnapshot({ ...snapshot, ...receipt }); setPending(null);
        if (decision.command.type === 'shoot') {
          const shot = decision.command;
          const confirmed = (receipt.game?.match ?? receipt.game?.lastMatch)?.events.find(e => e.id === shot.eventId);
          if (confirmed && typeof confirmed.goal === 'boolean') setShotFeedback({ id: confirmed.id, minute: confirmed.minute, goal: confirmed.goal, direction: shot.direction, player: snapshot.clubs.flatMap(c => c.players).find(p => p.id === confirmed.playerId)?.name ?? 'Jugador' });
        } else if (decision.command.type === 'start' || decision.command.type === 'nextSeason') setShotFeedback(null);
        if (autoAfterStart.current && receipt.game?.phase === 'playing') {
          autoAfterStart.current = false;
          decision = { requestId: crypto.randomUUID(), expectedVersion: receipt.version, command: { type: 'auto', season: receipt.game.season, round: receipt.game.round } };
          continue;
        }
        autoAfterStart.current = false;
        setMessage(receipt.game?.phase === 'playing' ? 'El partido está en curso.' : 'Tu progreso quedó guardado.');
        break;
      }
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof GameRequestError && error.status !== undefined && error.status >= 400 && error.status < 500) {
        setPending(null); autoAfterStart.current = false;
      }
      setMessage(error instanceof GameRequestError ? withReference(error.message, error.reference) : 'No pudimos confirmar la acción. Reintentá para recuperar su resultado.');
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }

  function play(simulate: boolean) {
    if (!game || !club) return;
    if (game.phase === 'playing') {
      if (simulate) void act({ type: 'auto', season: game.season, round: game.round });
      else setTab('Central');
      return;
    }
    if (!draft || !validSelection(club, draft.value)) { setMessage('Completá un once válido antes de jugar.'); setTab('Equipo'); return; }
    void act({ type: 'start', season: game.season, round: game.round, ...draft.value }, simulate);
  }
  const overview = game ? careerOverview(game) : null;
  const next = overview?.next;
  const disabled = busy || pending !== null;
  const standings = (full: boolean) => <div className={styles.tableWrap}><table><caption className={styles.srOnly}>Clasificación de la temporada</caption><thead><tr><th scope="col">Pos.</th><th scope="col">Club</th><th scope="col">PJ</th><th scope="col">DG</th><th scope="col">Pts</th></tr></thead><tbody>{(full ? game?.table : overview?.nearby)?.map(row => <tr key={row.clubId} className={row.clubId === game?.clubId ? styles.own : ''}><td>{row.rank}</td><th scope="row">{name(row.clubId)}{row.clubId === game?.clubId && <span className={styles.srOnly}> · Tu equipo</span>}</th><td>{row.played}</td><td>{row.for - row.against}</td><td><strong>{row.points}</strong></td></tr>)}</tbody></table></div>;
  const calendar = (full: boolean) => <ol className={styles.fixtures}>{(full ? overview?.fixtures : overview?.fixtures.filter(f => f.round >= (game?.round ?? 1)).slice(0, 3))?.map(f => { const result = game?.results.find(r => r.id === f.id); return <li key={f.id}><span className={styles.round}>J{f.round}</span><div><strong>{name(f.home === game?.clubId ? f.away : f.home)}</strong><small>{f.home === game?.clubId ? 'Local' : 'Visitante'} · Liga de carrera</small></div><span>{result ? `${result.homeGoals} — ${result.awayGoals}` : 'Por jugar'}</span></li>; })}</ol>;

  return <main className={styles.dashboard}>
    <div className={styles.content}><header className={styles.header}><div className={styles.manager}><ClubMark club={club}/><div><p className={styles.kicker}>CAMINO A LA GLORIA</p><strong>{managerName}</strong><p>{club?.name ?? 'Tu próxima oportunidad'}</p></div></div><div className={styles.summary}>{game && <><span>Temporada <b>{game.season}</b></span><span>Reputación <b>{game.reputation}</b></span><span>Posición <b>{overview?.standing?.rank ?? '—'}°</b></span></>}<button className="text-button" disabled={busy} onClick={() => { void onSignOut().catch(() => setMessage("No pudimos cerrar la sesión. Volvé a intentar.")); }}>Cerrar sesión</button></div></header>
    <nav className={styles.nav} aria-label="Modo Carrera">{['Central', 'Equipo', 'Tabla', 'Calendario'].map(item => <button key={item} onClick={() => { setTab(item); setMeter(null); }} aria-current={tab === item ? 'page' : undefined}>{item}</button>)}<button onClick={refresh} disabled={busy || pending !== null}>Actualizar ↻</button></nav>
    <div role="status" aria-live="polite" className={styles.feedback}>{busy ? 'Conectando con tu carrera…' : message}{pending && !busy && <button className="button secondary" onClick={() => void act()}>Reintentar acción</button>}</div>
    {!snapshot && !busy && <article className={styles.card}><h1>La carrera te espera.</h1><p>No pudimos recuperar el estado del juego.</p><button className="button" onClick={refresh}>Volver a intentar</button></article>}
    {snapshot && !game && <article className={styles.card}><p className={styles.kicker}>EL PRIMER PASO</p><h1>Elegí tu club.</h1><p>Tu carrera comienza con uno de estos equipos.</p><div className={styles.clubChoices}>{snapshot.clubs.filter(c => c.tier === 'low').map(c => <button key={c.id} className="button secondary" disabled={disabled} onClick={() => void act({ type: 'initialize', clubId: c.id })}><ClubMark club={c}/>{c.name}</button>)}</div></article>}
    {game && tab === 'Central' && <>
      <div className={styles.board}>
        <section className={`${styles.card} ${styles.nextMatch}`}><p className={styles.kicker}>{game.phase === 'finished' ? 'TEMPORADA COMPLETA' : `JORNADA ${game.round} · LIGA DE CARRERA`}</p><h1>{game.phase === 'finished' ? 'El próximo capítulo.' : game.phase === 'playing' ? 'El partido sigue.' : 'La próxima oportunidad.'}</h1>{next ? <><div className={styles.versus}><div><ClubMark club={clubById(next.home)}/><strong>{name(next.home)}</strong></div><span>VS</span><div><ClubMark club={clubById(next.away)}/><strong>{name(next.away)}</strong></div></div><p>{next.home === game.clubId ? 'Jugás de local' : 'Jugás de visitante'} · Temporada {game.season}</p><small>Calendario por jornadas · fecha no disponible</small></> : <p>Terminaste la temporada. Elegí dónde continuar tu carrera.</p>}</section>
        <section className={styles.actions} aria-label="Acciones del partido"><button className={styles.play} disabled={disabled || game.phase === 'finished' || (game.phase === 'ready' && !lineupValid)} onClick={() => play(false)}><span aria-hidden="true">▶</span><strong>{game.phase === 'playing' ? 'Continuar partido' : 'Jugar partido'}</strong><small>Resolvé las ocasiones</small></button><button className={styles.simulate} disabled={disabled || game.phase === 'finished' || (game.phase === 'ready' && !lineupValid)} onClick={() => play(true)}><span aria-hidden="true">▶▶</span><strong>Simular partido</strong><small>Resolución automática</small></button></section>
        <section className={`${styles.card} ${styles.tableCard}`}><div className={styles.cardHeading}><h2>Tabla de posiciones</h2><span>{overview?.standing?.points ?? 0} PTS</span></div>{standings(false)}<button className={styles.more} onClick={() => setTab('Tabla')}>Ver tabla completa ↗</button></section>
        <section className={`${styles.card} ${styles.calendarCard}`}><div className={styles.cardHeading}><h2>En el horizonte</h2><span>CALENDARIO</span></div>{calendar(false)}{game.phase === 'finished' && <p>Calendario de esta temporada completado.</p>}<button className={styles.more} onClick={() => setTab('Calendario')}>Ver temporada completa ↗</button></section>
        <section className={`${styles.card} ${styles.teamCard}`}><p className={styles.kicker}>VESTUARIO</p><h2>Tu equipo, preparado.</h2><p>{club?.players.length} jugadores · {draft?.value.formation} · {draft ? tacticLabels[draft.value.tactic] : 'Sin selección'}</p><small>{lineupValid ? 'Tu once está listo para jugar.' : 'Completá un once válido en Equipo para habilitar Jugar y Simular.'}</small><button className={styles.more} onClick={() => setTab('Equipo')}>Consultar el plantel ↗</button></section>
        <section className={`${styles.card} ${styles.progressCard}`}><p className={styles.kicker}>EL PULSO DEL CLUB</p><h2>{Math.round((game.confidence[game.clubId] ?? 0) * 100)}% <small>confianza</small></h2><p>Objetivo: primeros {club?.target}</p>{game.lastMatch ? <p>Último resultado: {name(game.lastMatch.home)} {game.lastMatch.homeGoals} — {game.lastMatch.awayGoals} {name(game.lastMatch.away)}</p> : <p>Una temporada por construir.</p>}</section>
      </div>
      {(game.match?.pendingEvent || feedback) && <section className={`${styles.card} ${styles.encounter}`} ref={encounter} aria-label="Ocasión en curso"><p className={styles.kicker}>MANO A MANO · {game.match?.pendingEvent?.minute ?? feedback?.minute}′</p><h2>{name((game.match ?? game.lastMatch)!.home)} {(game.match ?? game.lastMatch)!.homeGoals} — {(game.match ?? game.lastMatch)!.awayGoals} {name((game.match ?? game.lastMatch)!.away)}</h2><MatchArena shooter={club?.players.find(p => p.id === game.match?.pendingEvent?.playerId)?.name ?? 'Jugador'} minute={game.match?.pendingEvent?.minute ?? feedback?.minute ?? 0} feedback={feedback}/>{game.match?.pendingEvent && <><p>Elegí una dirección y detené la barra cerca del centro.</p><div className={styles.directions}>{(['left', 'center', 'right'] as Direction[]).map((d, i) => <button className="button secondary" key={d} aria-pressed={direction === d} disabled={disabled} onClick={() => setDirection(d)}>{['Izquierda', 'Centro', 'Derecha'][i]}</button>)}</div><div className={styles.meter} aria-label="Precisión: el centro es 100 y los extremos son 0"><span style={{ left: `${position}%` }}/></div><button className="button" disabled={disabled} onClick={() => { if (meter === null) { setPosition(0); setMeter(performance.now()); } else { const precision = Math.round((1 - Math.abs(2 * position / 100 - 1)) * 100); void act({ type: 'shoot', season: game.season, round: game.round, eventId: game.match!.pendingEvent!.id, direction, precision }); } }}>{meter === null ? 'Iniciar barra' : 'Patear'}</button><button className="text-button" disabled={disabled} onClick={() => play(true)}>Resolver automáticamente</button></>}</section>}
      {game.lastMatch && <MatchNarrative key={`${game.season}:${game.lastMatch.id}`} careerId={careerId} season={game.season} fixtureId={game.lastMatch.id} summary={`${name(game.lastMatch.home)} ${game.lastMatch.homeGoals} — ${game.lastMatch.awayGoals} ${name(game.lastMatch.away)}`}/>}
      {game.phase === 'finished' && <section className={`${styles.card} ${styles.encounter}`}><h2>Tu próxima temporada</h2><div className={styles.clubChoices}><button className="button" disabled={disabled} onClick={() => void act({ type: 'nextSeason', season: game.season, offerClubId: null })}>Seguir en {club?.name}</button>{game.offers.map(id => <button className="button secondary" key={id} disabled={disabled} onClick={() => void act({ type: 'nextSeason', season: game.season, offerClubId: id })}>Aceptar oferta de {name(id)}</button>)}</div></section>}
    </>}
    {game && tab === 'Tabla' && <section className={styles.card}><h1>La clasificación.</h1>{standings(true)}<p className="fine">Desempate: puntos, diferencia de gol, goles a favor, victorias y sorteo persistido del motor.</p></section>}
    {game && tab === 'Calendario' && <section className={styles.card}><h1>El camino de la temporada.</h1><p>Jornadas de la carrera. El motor no asigna fechas de calendario.</p>{calendar(true)}</section>}
    {game && club && draft && tab === 'Equipo' && <TeamEditor club={club} selection={draft.value} disabled={disabled || game.phase !== 'ready'} persisted={draft.persisted} onChange={editSelection}/>}
    <footer className={styles.footer}><Link href="/">← Inicio</Link><span>Datos {snapshot?.isSynthetic ? 'sintéticos' : 'del dataset de la carrera'} · Distintivos con iniciales, sin escudos oficiales</span><Link href="/estado">Estado del servicio</Link></footer>
    </div>
  </main>;
}
