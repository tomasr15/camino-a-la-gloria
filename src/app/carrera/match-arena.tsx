"use client";
import type { CSSProperties } from 'react';
import type { Direction } from '../../../supabase/functions/_shared/game/model';
import styles from './career-dashboard.module.css';

export type ConfirmedShot = { id: string; goal: boolean; direction: Direction; player: string; minute: number };
export default function MatchArena({ shooter, minute, feedback }: { shooter: string; minute: number; feedback: ConfirmedShot | null }) {
  const goal = feedback?.goal;
  const x = feedback?.direction === 'left' ? '-105px' : feedback?.direction === 'right' ? '105px' : '0px';
  return <div className={styles.arena} aria-label="Cancha de fútbol con arco, arquero y pelota">
    <div className={styles.arenaLights} aria-hidden="true"/>
    <div className={styles.arenaCaption}>{feedback ? `${feedback.minute}′ · ${feedback.player}` : `${minute}′ · ${shooter}`}</div>
    <div className={styles.goal} aria-hidden="true"/>
    <div className={styles.keeper} aria-hidden="true"/>
    <div key={feedback?.id ?? 'waiting'} className={`${styles.ball} ${feedback ? styles.ballResolved : ''}`} style={{ '--shot-x': x, '--shot-y': goal ? '-155px' : '-120px' } as CSSProperties} aria-hidden="true"/>
    <div className={styles.arenaResult} role="status" aria-live="polite">{feedback ? goal ? '¡GOL! · Confirmado' : 'Sin gol · Confirmado' : 'Tu próxima decisión'}</div>
    {feedback && <span className={styles.arenaNote}>Representación del resultado confirmado; el motor no informa la trayectoria ni el movimiento del arquero.</span>}
  </div>;
}
