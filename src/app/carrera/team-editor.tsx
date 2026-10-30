"use client";
import type { Club, Formation, Position, Selection, Tactic } from '../../../supabase/functions/_shared/game/model';
import { bestLineup } from '../../../supabase/functions/_shared/game/data';
import { fitFormation, formationCounts, positionLabels, validSelection } from '@/lib/lineup-draft';
import styles from './career-dashboard.module.css';

export default function TeamEditor({ club, selection, disabled, persisted, onChange }: { club: Club; selection: Selection; disabled: boolean; persisted: boolean; onChange: (value: Selection) => void }) {
  const counts = formationCounts(selection.formation);
  const positions: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
  return <section className={styles.card}><p className={styles.kicker}>EL PARTIDO EMPIEZA ACÁ</p><h1>Tu once. Tu idea.</h1>
    <div className={styles.teamControls}><label>Formación<select value={selection.formation} disabled={disabled} onChange={e => onChange(fitFormation(club, selection, e.target.value as Formation))}><option>4-4-2</option><option>4-3-3</option></select></label><label>Táctica<select value={selection.tactic} disabled={disabled} onChange={e => onChange({ ...selection, tactic: e.target.value as Tactic })}><option value="defensive">Defensiva</option><option value="balanced">Equilibrada</option><option value="offensive">Ofensiva</option></select></label><button className="button secondary" disabled={disabled} onClick={() => onChange({ ...selection, lineup: bestLineup(club, selection.formation) })}>Once recomendado</button></div>
    <p role="status" aria-live="polite">{selection.lineup.length} / 11 titulares · {validSelection(club, selection) ? 'Once válido' : 'Completá los puestos indicados antes de jugar'}</p>
    <div className={styles.teamLayout}><div className={styles.teamPitch} aria-label={`Once titular en formación ${selection.formation}`}><div className={styles.centerCircle}/>{[...positions].reverse().map(position => <div className={styles.pitchRow} key={position}>{club.players.filter(p => p.position === position && selection.lineup.includes(p.id)).map(player => <span className={styles.pitchPlayer} key={player.id}><span className={styles.shirt}>{position}</span><strong>{player.name}</strong></span>)}</div>)}</div>
    <div className={styles.squadList}>{positions.map(position => <fieldset key={position} disabled={disabled}><legend>{positionLabels[position]} · {club.players.filter(p => p.position === position && selection.lineup.includes(p.id)).length}/{counts[position]}</legend>{club.players.filter(p => p.position === position).map(player => <label key={player.id} className={styles.playerChoice}><input type="checkbox" checked={selection.lineup.includes(player.id)} onChange={e => onChange({ ...selection, lineup: e.target.checked ? [...selection.lineup, player.id] : selection.lineup.filter(id => id !== player.id) })}/><span><strong>{player.name}</strong><small>ATA {player.attack} · DEF {player.defense} · ARQ {player.saves}</small></span></label>)}</fieldset>)}</div></div>
    <p className="fine">{disabled ? 'La selección está bloqueada mientras el partido o una acción estén en curso.' : persisted ? 'Borrador guardado en este navegador. Se confirma con el partido al jugar o simular.' : 'Borrador disponible en esta sesión. El navegador no permitió guardarlo localmente.'}</p>
  </section>;
}
