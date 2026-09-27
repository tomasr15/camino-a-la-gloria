import Link from "next/link";

export default function Home() {
  return <>
    <header className="nav wrap"><Link className="brand" href="/" aria-label="Camino a la Gloria, inicio"><span className="crest">CG</span> CAMINO A LA GLORIA</Link><span className="edition">EDICIÓN ACADÉMICA · 2026</span><Link className="nav-link" href="/carrera">Mi carrera <span>↗</span></Link></header>
    <main>
      <section className="hero wrap">
        <div className="hero-copy"><p className="eyebrow"><span className="dot" /> EL FÚTBOL EMPIEZA CON UNA DECISIÓN</p><h1>Nadie empieza<br />en la <em>cima.</em></h1><p className="lead">Tu primer club. Tu primera oportunidad.<br />El comienzo de una historia que vas a dirigir vos.</p><Link className="button" href="/carrera">Comenzar mi camino <span>↗</span></Link><p className="fine">Versión inicial · Registro y creación de carrera</p></div>
        <div className="pitch-art" aria-label="Ilustración de una cancha de fútbol"><div className="pitch"><div className="half"/><div className="circle"/><div className="box top"/><div className="box bottom"/><span className="player p1">01</span><span className="player p2">04</span><span className="player p3">08</span><span className="player p4">10</span><span className="player p5">09</span></div><div className="ticket"><span>PRÓXIMO DESTINO</span><strong>El banco de suplentes.</strong><small>El lugar donde empieza todo.</small></div><div className="art-note">PASIÓN LOCAL. AMBICIÓN GLOBAL.</div></div>
      </section>
      <section className="journey wrap"><div><p className="eyebrow">UNA CARRERA, MUCHOS DESTINOS</p><h2>De abajo hacia arriba.</h2></div><div className="journey-stops"><article><span>01 / EL ORIGEN</span><h3>Ascenso local</h3><p>Ganate tu primera oportunidad.</p></article><article><span>02 / EL DESAFÍO</span><h3>Primera división</h3><p>Convertí resultados en reputación.</p></article><article><span>03 / LA AMBICIÓN</span><h3>Salto internacional</h3><p>Construí tu camino a las grandes ligas.</p></article></div><p className="fine">Recorrido previsto para el producto. La simulación y la progresión se incorporarán en las próximas entregas.</p></section>
    </main><footer className="wrap footer"><span>CAMINO A LA GLORIA</span><span>UTN FRLP · Desarrollo de Software Cloud</span><Link href="/estado">Estado del servicio ↗</Link></footer>
  </>;
}
