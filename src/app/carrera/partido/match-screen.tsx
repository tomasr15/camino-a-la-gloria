'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Direction, Selection } from '../../../../supabase/functions/_shared/game/model';
import { readDraft, validSelection } from '@/lib/lineup-draft';
import { GameRequestError, readGame, sendDecision, type Decision, type GameSnapshot } from '@/lib/career-game';
import { getSupabase } from '@/lib/supabase';
import { withReference } from '@/lib/functions';
import MatchArena, { type ConfirmedShot } from '../match-arena';
import styles from './match-screen.module.css';

type Event = NonNullable<NonNullable<GameSnapshot['game']>['match']>['events'][number];

export default function MatchScreen() {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<Decision | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [direction, setDirection] = useState<Direction>('center');
  const [meter, setMeter] = useState<number | null>(null);
  const [position, setPosition] = useState(50);
  const [feedback, setFeedback] = useState<ConfirmedShot | null>(null);
  const [preparation, setPreparation] = useState<{ selection: Selection; automatic: boolean; season: number; round: number } | null>(null);
  const [startRetry, setStartRetry] = useState<Decision | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const game = snapshot?.game;
  const preparing = Boolean(preparation && game?.phase === 'ready' && game.season === preparation.season && game.round === preparation.round);
  const fixture = preparing ? game?.calendar.find(item => item.round === game.round && (item.home === game.clubId || item.away === game.clubId)) : null;
  const match = fixture ? { ...fixture, events: [], homeGoals: 0, awayGoals: 0 } : game?.match ?? game?.lastMatch;
  const home = snapshot?.clubs.find(club => club.id === match?.home);
  const away = snapshot?.clubs.find(club => club.id === match?.away);
  const playerName = useCallback((id: string) => snapshot?.clubs.flatMap(club => club.players).find(player => player.id === id)?.name ?? 'Jugador', [snapshot]);
  const pendingEvent = game?.phase === 'playing' ? game.match?.pendingEvent : null;
  const events: Event[] = match?.events ?? [];
  const goals = { home: match?.homeGoals ?? 0, away: match?.awayGoals ?? 0 };
  const minute = game?.phase === 'playing' ? pendingEvent?.minute ?? events.at(-1)?.minute ?? 0 : 90;
  const isFinal = Boolean(!preparing && game && game.phase !== 'playing' && game.lastMatch);

  useEffect(() => {
    mounted.current = true;
    void readGame(getSupabase()!).then(data => {
      if (!mounted.current) return;
      const params = new URLSearchParams(window.location.search);
      const loadedGame = data.game;
      const club = data.clubs.find(item => item.id === loadedGame?.clubId);
      if (params.get('preparar') === '1' && loadedGame?.phase === 'ready' && club &&
          loadedGame.season === Number(params.get('temporada')) && loadedGame.round === Number(params.get('jornada'))) {
        const selection = readDraft(params.get('borrador') ?? '', club);
        if (validSelection(club, selection)) {
          setPreparation({ selection, automatic: params.get('modo') === 'auto', season: loadedGame.season, round: loadedGame.round });
        }
      }
      setSnapshot(data);
    }).catch(error => {
      if (mounted.current) setMessage(error instanceof GameRequestError ? withReference(error.message, error.reference) : 'No pudimos cargar el partido.');
    }).finally(() => { if (mounted.current) setBusy(false); });
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 1400);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (meter === null) return;
    let frame = 0;
    const tick = (now: number) => { setPosition((1 - Math.abs(((now - meter) / 2000) % 2 - 1)) * 100); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [meter]);

  async function startMatch() {
    if (!snapshot || !game || !preparation || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    let decision: Decision = startRetry ?? {
      requestId: crypto.randomUUID(),
      expectedVersion: snapshot.version,
      command: { type: 'start', season: preparation.season, round: preparation.round, ...preparation.selection },
    };
    try {
      let receipt = await sendDecision(getSupabase()!, decision);
      if (!mounted.current) return;
      if (preparation.automatic && decision.command.type === 'start' && receipt.game?.phase === 'playing') {
        decision = {
          requestId: crypto.randomUUID(),
          expectedVersion: receipt.version,
          command: { type: 'auto', season: receipt.game.season, round: receipt.game.round },
        };
        receipt = await sendDecision(getSupabase()!, decision);
      }
      if (!mounted.current) return;
      setSnapshot({ ...snapshot, ...receipt });
      setStartRetry(null);
      setPreparation(null);
    } catch (error) {
      if (!mounted.current) return;
      setStartRetry(decision);
      setMessage(error instanceof GameRequestError ? withReference(error.message, error.reference) : 'No pudimos iniciar el partido. Reintentá para recuperar la acción.');
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function shoot() {
    if (!snapshot || !game || !pendingEvent || lock.current) return;
    if (meter === null) { setPosition(0); setMeter(performance.now()); return; }
    const precision = Math.round((1 - Math.abs(2 * position / 100 - 1)) * 100);
    const decision: Decision = pending ?? { requestId: crypto.randomUUID(), expectedVersion: snapshot.version, command: { type: 'shoot', season: game.season, round: game.round, eventId: pendingEvent.id, direction, precision } };
    lock.current = true; setBusy(true); setMessage(''); setMeter(null);
    try {
      const receipt = await sendDecision(getSupabase()!, decision);
      if (!mounted.current) return;
      const updated = { ...snapshot, ...receipt };
      setSnapshot(updated); setPending(null); setAccepted(false);
      const event = (receipt.game?.match ?? receipt.game?.lastMatch)?.events.find(item => item.id === pendingEvent.id);
      if (event) setFeedback({ id: event.id, minute: event.minute, goal: event.goal === true, direction, player: playerName(event.playerId) });
    } catch (error) {
      if (!mounted.current) return;
      setPending(decision);
      setMessage(error instanceof GameRequestError ? withReference(error.message, error.reference) : 'No pudimos confirmar el remate.');
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }

  function crest(name: string | undefined) {
    return <span className={styles.crest} aria-hidden="true">{name?.split(' ').map(part => part[0]).slice(0, 3).join('') ?? '—'}</span>;
  }
  function teamStats(teamId: string | undefined, teamName: string | undefined) {
    const teamEvents = events.filter(event => event.clubId === teamId);
    const shots = teamEvents.length + (pendingEvent?.clubId === teamId ? 1 : 0);
    const scored = teamEvents.filter(event => event.goal).length;
    return <section className={styles.stats} aria-label={`Estadísticas de ${teamName ?? 'equipo'}`}>
      <h2>{teamName}</h2>
      <div className={styles.stat}><span>Posesión</span><strong>—</strong><small>Sin dato del simulador</small></div>
      <div className={styles.stat}><span>Tiros</span><strong>{shots}</strong><small>Registrados hasta ahora</small></div>
      <div className={styles.stat}><span>Ocasiones</span><strong>{shots}</strong><small>{scored} convertidas</small></div>
    </section>;
  }

  if (busy && !snapshot) return <main className={styles.screen}><p role="status">Cargando partido…</p></main>;
  if (!match) return <main className={styles.screen}><section className={styles.empty}><p className={styles.kicker}>MODO CARRERA</p><h1>{message || 'No hay un partido en curso.'}</h1><Link className="button" href="/carrera">Volver a Carrera</Link></section></main>;

  const shooter = pendingEvent ? playerName(pendingEvent.playerId) : feedback?.player ?? '—';
  const displayEvents = [...events].sort((a, b) => a.minute - b.minute);
  const milestone = (at: number, label: string) => (
    <li className={styles.milestone}><time>{at}′</time><span>{label}</span></li>
  );
  const renderEvent = (event: Event) => (
    <li key={event.id} className={event.goal ? styles.goal : undefined}>
      <time>{event.minute}′</time>
      <div className={event.clubId === match.home ? styles.homeEvent : styles.awayEvent}>
        <span aria-hidden="true">{event.goal ? '⚽︎' : '◎'}</span>
        <div><strong>{playerName(event.playerId)}</strong><p>{event.goal ? '¡Gol!' : 'Ocasión fallada'}</p></div>
      </div>
    </li>
  );
  return <main className={styles.screen}>
    <header className={styles.scoreboard}>
      <p className={`${styles.kicker} ${styles.competition}`}>LIGA DE CARRERA · JORNADA {match.round}</p>
      <div className={styles.team}>{crest(home?.name)}<strong>{home?.name ?? 'Local'}</strong></div>
      <div className={styles.score}><strong>{goals.home}<i>:</i>{goals.away}</strong><span>{preparing ? '00:00 · Por comenzar' : isFinal ? '90:00 · Final' : `${minute}′ · ${pendingEvent ? 'Simulación pausada' : 'Encuentro en curso'}`}</span></div>
      <div className={`${styles.team} ${styles.away}`}>{crest(away?.name)}<strong>{away?.name ?? 'Visitante'}</strong></div>
    </header>
    <div className={styles.matchBody}>
      {teamStats(match.home, home?.name)}
      <section className={styles.timeline} aria-label="Cronología del partido">
        <div className={styles.timelineHead}><h1>{isFinal ? 'Final del encuentro' : 'Acontecimientos'}</h1></div>
        {preparing && <div className={styles.kickoff}>
          <p className={styles.kicker}>TODO LISTO PARA JUGAR</p>
          <h2>El encuentro está por comenzar</h2>
          <p>{preparation?.automatic ? 'Seguí el resultado de la simulación automática.' : 'Intervení en las ocasiones de tu equipo.'}</p>
          <button className="button" disabled={busy} onClick={() => void startMatch()}>{busy ? 'Iniciando…' : startRetry ? 'Reintentar inicio' : 'Empezar partido'}</button>
        </div>}
        {!isFinal && pendingEvent && !accepted && !feedback && <aside className={styles.chance} role="status"><p className={styles.kicker}>OPORTUNIDAD DE GOL · {pendingEvent.minute}′</p><h2>{shooter} tiene una oportunidad para convertir.</h2><button className="button" onClick={() => setAccepted(true)}>Patear</button></aside>}
        {!isFinal && pendingEvent && accepted && <section className={styles.shooter} aria-label="Minijuego de remate">
          <h2>Remate · {shooter}</h2><MatchArena className={styles.arena} shooter={shooter} minute={pendingEvent.minute} feedback={feedback}/>
          <p>Elegí la dirección y detené la barra para definir la precisión.</p>
          <div className={styles.controls}>{(['left', 'center', 'right'] as Direction[]).map((value, index) => <button className="button secondary" key={value} aria-pressed={direction === value} disabled={busy} onClick={() => setDirection(value)}>{['Izquierda', 'Centro', 'Derecha'][index]}</button>)}</div>
          <div className={styles.meter} aria-label="Precisión del remate"><span style={{ left: `${position}%` }}/></div>
          <button className="button" disabled={busy} onClick={() => void shoot()}>{meter === null ? 'Iniciar precisión' : 'Patear'}</button>
        </section>}
        {feedback && <p className={styles.result} role="status">{feedback.goal ? '¡Gol!' : 'No convirtió'} · {feedback.minute}′ · {feedback.player}</p>}
        {message && <p className={styles.message} role="status">{message}</p>}
        {!preparing && <ol className={styles.events} tabIndex={0} aria-label="Jugadas por minuto">
          {displayEvents.filter(event => event.minute <= 45).map(renderEvent)}
          {(isFinal || minute > 45) && milestone(45, 'Fin del primer tiempo')}
          {displayEvents.filter(event => event.minute > 45).map(renderEvent)}
          {isFinal && milestone(90, 'Fin del encuentro')}
          {!displayEvents.length && !pendingEvent && <li className={styles.quiet}>El encuentro todavía no registra ocasiones.</li>}
        </ol>}
      </section>
      {teamStats(match.away, away?.name)}
    </div>
    <footer className={styles.footer}>
      {isFinal ? <Link className="button secondary" href="/carrera?volver=partido"><span aria-hidden="true">←</span> Volver a Carrera</Link> : <Link href="/carrera">← Carrera</Link>}
      {busy && <span role="status">Guardando la jugada…</span>}
    </footer>
  </main>;
}
