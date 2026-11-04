"use client";
import { useEffect, useState } from 'react';
import type { SavedNarrative } from '../../../supabase/functions/_shared/narrative/service';
import { validateNarrative } from '../../../supabase/functions/_shared/contracts';
import { invokeFunction } from '@/lib/functions';
import { getSupabase } from '@/lib/supabase';
import styles from './career-dashboard.module.css';

export default function MatchNarrative({ careerId, season, fixtureId, summary }: { careerId: string; season: number; fixtureId: string; summary: string }) {
  const [entry, setEntry] = useState<SavedNarrative | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => { if (!cancelled) setStatus('failed'); }, 12000);
    void invokeFunction<SavedNarrative>(getSupabase()!, 'narrative', { body: { season, fixtureId } }).then(response => {
      if (cancelled) return;
      try {
        if (response.error || !response.data || !['gemini', 'fallback'].includes(response.data.source)) throw new Error('NARRATIVE_UNAVAILABLE');
        const narrative = validateNarrative(response.data.narrative, `${careerId}/${season}/${fixtureId}`);
        setEntry({ ...response.data, narrative }); setStatus('ready');
      } catch { setStatus('failed'); }
    }).finally(() => clearTimeout(timeout));
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [careerId, season, fixtureId]);
  return <section className={`${styles.card} ${styles.encounter}`} aria-label="Crónica del último partido"><p className={styles.kicker}>DESPUÉS DEL SILBATAZO</p><h2>{entry?.narrative.title ?? 'El resultado está confirmado.'}</h2><p>{summary}</p>
    {entry ? <><p className={styles.narrativeText}>{entry.narrative.body}</p><p className="fine">{entry.source === 'gemini' ? 'Crónica generada con IA' : 'Relato alternativo'} · Las escenas de tribuna son ficción.</p></> : <p className="fine" role="status">{status === 'loading' ? 'Preparando la crónica… Podés continuar jugando.' : 'La crónica no está disponible. El resultado y tu progreso están guardados; podés continuar.'}</p>}
  </section>;
}
