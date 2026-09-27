"""Generate the reviewable CP1 report and diagrams from versioned sources.
Requires reportlab and pypdfium2; no cloud credentials are read.
"""
from pathlib import Path
from math import atan2, cos, sin, pi
from xml.sax.saxutils import escape
import json
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image, KeepTogether
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon
from reportlab.graphics import renderPDF, renderSVG

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs'/'entrega'; OUT.mkdir(parents=True,exist_ok=True)
NAVY=colors.HexColor('#132A32'); GREEN=colors.HexColor('#18705C'); PALE=colors.HexColor('#EEF5F2'); GRAY=colors.HexColor('#52616B'); GOLD=colors.HexColor('#B88D3D')
meta_path=ROOT/'docs'/'evidencias'/'estado.json'
meta=json.loads(meta_path.read_text(encoding='utf-8')) if meta_path.exists() else {}

def architecture():
 d=Drawing(1000,620)
 d.add(Rect(0,0,1000,620,fillColor=colors.white,strokeColor=None))
 def txt(x,y,text,size=12,color=NAVY,font='Helvetica',anchor='start'):
  d.add(String(x,y,text,fontName=font,fontSize=size,fillColor=color,textAnchor=anchor))
 def box(x,y,w,h,title,lines,fill=PALE,stroke=GREEN):
  d.add(Rect(x,y,w,h,rx=8,ry=8,fillColor=fill,strokeColor=stroke,strokeWidth=1.2))
  txt(x+12,y+h-23,title,13,font='Helvetica-Bold')
  for i,line in enumerate(lines):txt(x+12,y+h-44-i*17,line,11)
 def arrow(points,label='',lx=None,ly=None,dashed=False):
  for a,b in zip(points,points[1:]):
   line=Line(*a,*b,strokeColor=GOLD if dashed else GRAY,strokeWidth=1.5)
   if dashed:line.strokeDashArray=[5,4]
   d.add(line)
  a,b=points[-2:];ang=atan2(b[1]-a[1],b[0]-a[0]);l=8
  d.add(Polygon([b[0],b[1],b[0]-l*cos(ang-pi/6),b[1]-l*sin(ang-pi/6),b[0]-l*cos(ang+pi/6),b[1]-l*sin(ang+pi/6)],fillColor=GOLD if dashed else GRAY,strokeColor=None))
  if label:txt(lx,ly,label,10,GOLD if dashed else GRAY)
 txt(20,595,'CAMINO A LA GLORIA / ARQUITECTURA CLOUD',19,font='Helvetica-Bold')
 txt(20,573,'CP1: base desplegable | CP2: motor, datos deportivos e IA',12,GRAY)
 d.add(Rect(285,120,430,430,rx=12,ry=12,fillColor=colors.HexColor('#F6F9FA'),strokeColor=colors.HexColor('#AEC6C9')))
 txt(302,526,'SUPABASE / BACKEND CONFIABLE',12,font='Helvetica-Bold')
 box(20,430,215,110,'Navegador',['Interfaz y sesión del usuario','Cliente no confiable','Sin credenciales privilegiadas'])
 box(20,285,215,90,'Vercel / Next.js',['React + TypeScript','Frontend web gestionado'])
 box(310,415,180,80,'Auth',['Registro y confirmación','JWT verificado en servidor'])
 box(310,300,180,85,'Edge / careers',['GET y POST autenticados','Validación + límite 2 KB'])
 box(310,180,180,80,'Edge / health',['Disponibilidad pública','Sin datos de usuarios'])
 box(530,300,160,185,'PostgreSQL',['dataset_versions','careers','RLS por propietario','Una carrera por usuario','Privilegios por columna'])
 box(530,180,160,80,'Logs JSON',['requestId y código HTTP','Duración, sin secretos'])
 box(755,405,220,105,'CP2 / Datos deportivos',['API-Football','Importación con cuota y caché','Dataset por temporada'],colors.HexColor('#FFFAF0'),GOLD)
 box(755,255,220,105,'CP2 / Motor e IA',['Motor TypeScript: resultados','Gemini: narrativa JSON','Validación y fallback'],colors.HexColor('#FFFAF0'),GOLD)
 box(20,85,215,90,'GitHub',['Código, PR y tablero','Conventional Commits'])
 box(310,15,380,80,'GitHub Actions',['CI: lint, tipos, contratos, build y SQL','CD backend preparado; secretos pendientes'])
 arrow([(125,375),(125,430)],'HTTPS: interfaz',40,400)
 arrow([(235,470),(310,470)],'Login',246,480)
 arrow([(235,440),(268,440),(268,344),(310,344)],'JWT',273,360)
 arrow([(400,385),(400,415)],'getUser',408,397)
 arrow([(490,350),(530,350)],'RLS',493,361)
 arrow([(235,435),(253,435),(253,220),(310,220)],'Salud',258,230)
 arrow([(490,220),(508,220),(508,320),(530,320)],'Lectura mínima',405,272)
 arrow([(450,300),(450,280),(610,280),(610,260)],'Observabilidad',461,285)
 arrow([(490,200),(530,200)])
 arrow([(755,445),(690,445)],'Importar',699,456,True)
 arrow([(690,330),(755,330)],'Contexto',696,341,True)
 arrow([(125,175),(125,285)],'Integración Git',32,215)
 arrow([(235,125),(265,125),(265,55),(310,55)],'Validar',270,105)
 arrow([(500,95),(500,120)],'Migraciones y funciones',514,104)
 txt(745,150,'Líneas continuas: base de CP1.',11,GRAY)
 txt(745,130,'Líneas punteadas: diseño de CP2.',11,GRAY)
 txt(745,100,'Una cuenta = una carrera privada.',11,font='Helvetica-Bold')
 txt(745,80,'El fixture inicial es sintético.',11,GRAY)
 return d

d=architecture()
renderPDF.drawToFile(d,str(OUT/'arquitectura-cloud.pdf'))
renderSVG.drawToFile(d,str(OUT/'arquitectura-cloud.svg'))
import pypdfium2 as pdfium
diagram_doc=pdfium.PdfDocument(str(OUT/'arquitectura-cloud.pdf'))
diagram_doc[0].render(scale=1.6).to_pil().save(OUT/'arquitectura-cloud.png')

styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleCP',fontName='Helvetica-Bold',fontSize=34,leading=38,textColor=NAVY,spaceAfter=18))
styles.add(ParagraphStyle(name='SubCP',fontName='Helvetica-Bold',fontSize=18,leading=22,textColor=GREEN,spaceAfter=14))
styles.add(ParagraphStyle(name='BodyCP',fontName='Helvetica',fontSize=11,leading=15,textColor=NAVY,spaceAfter=10))
styles.add(ParagraphStyle(name='SmallCP',fontName='Helvetica',fontSize=9,leading=12,textColor=GRAY,spaceAfter=8))
styles.add(ParagraphStyle(name='CellCP',fontName='Helvetica',fontSize=10,leading=13,textColor=NAVY))
styles.add(ParagraphStyle(name='HeadCP',fontName='Helvetica-Bold',fontSize=10,leading=13,textColor=colors.white))
story=[]
def p(text,style='BodyCP'):return Paragraph(text,styles[style])
def add(text,style='BodyCP'):story.append(p(text,style))
def table(headers,rows,widths):
 data=[[p(escape(x),'HeadCP') for x in headers]]+[[p(escape(str(x)),'CellCP') for x in row] for row in rows]
 t=Table(data,colWidths=widths,hAlign='LEFT',repeatRows=1)
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),('ROWBACKGROUNDS',(0,1),(-1,-1),[PALE,colors.white]),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#D4DFDC'))]))
 story.append(t)
def page(title,kicker):
 if story:story.append(PageBreak())
 add(kicker,'SmallCP');add(title,'SubCP')

W,H=landscape(A4); content=W-84
page('Camino a la Gloria','UTN FRLP / DESARROLLO DE SOFTWARE CLOUD / 2026')
add('Checkpoint 1<br/>Arquitectura e infraestructura','TitleCP')
add('Del ascenso local a las grandes ligas europeas. Una carrera de director técnico accesible desde el navegador, con datos versionados, reglas verificables y narrativa contextual.','BodyCP')
story.append(Spacer(1,14))
table(['ENTREGA','EQUIPO','ALCANCE TÉCNICO'],[['28/09/2026','Julian Coloma · Lucas Modernell · Tomas Rosato','Arquitectura, setup cloud y repositorio con actividad.']], [130,300,content-430])
story.append(Spacer(1,18))
add('<b>Base inicial:</b> interfaz web, registro/inicio de sesión, una carrera privada por usuario y comprobación de conectividad. El motor de partidos, los datos reales y Gemini se incorporan en CP2.')
add('<b>Autoría:</b> implementación asistida por Codex. Las pruebas automáticas y el despliegue se documentan con evidencias; la revisión humana y la defensa individual siguen siendo responsabilidad de los integrantes.','SmallCP')

page('Qué exige la entrega y qué se construyó','01 / ALCANCE Y TRAZABILIDAD')
table(['FUENTE','REQUISITO','RESULTADO'],[
 ['TPI p. 3, sección 5','Diagrama cloud detallado','Diagrama exportado en SVG, PNG y PDF; arquitectura, flujos y decisiones documentados.'],
 ['TPI p. 3, sección 5','Setup de infraestructura','Vercel para frontend; Supabase Auth, PostgreSQL y dos Edge Functions; migración versionada.'],
 ['TPI p. 3, sección 5','Repositorio inicial con actividad','Código, commits identificados, PR, CI y tablero; sin inventar historial previo.'],
 ['TPI pp. 2-4','Auditoría y estándares de ingeniería','AI-DECISIONS, RLS, logs JSON, pruebas, Conventional Commits y límites WIP.'],
 ['One-pager p. 1','Carrera guardada y evolución del producto','Una carrera por usuario; modelo versionado. Fixture sintético identificado para comprobar infraestructura.']
], [125,180,content-305])
story.append(Spacer(1,12))
add('<b>Próximos hitos:</b> demo funcional el 09/11/2026; defensa final el 30/11/2026. La suscripción histórica queda fuera del MVP académico.','SmallCP')

page('Diagrama cloud y límites de confianza','02 / ARQUITECTURA')
story.append(Image(str(OUT/'arquitectura-cloud.png'),width=content-50,height=(content-50)*620/1000))

page('Datos, autenticación y resiliencia','03 / DISEÑO TÉCNICO')
table(['CAPA','DECISIÓN Y COMPROBACIÓN'],[
 ['Identidad','Supabase Auth. careers verifica JWT con getUser antes de consultar o insertar. health es público y no devuelve datos privados.'],
 ['Persistencia','dataset_versions referencia temporada, origen y marca sintética. careers vincula usuario, versión, nombre del DT y reputación inicial.'],
 ['Aislamiento','RLS por propietario y unicidad de user_id. Inserción por columna; sin permisos cliente para actualizar reputación ni borrar carreras.'],
 ['Límite de entrada','Solo managerName, entre 2 y 60 caracteres; rechazo de atributos de propietario/estadísticas y cuerpo mayor a 2 KB.'],
 ['Fallos y observabilidad','Timeouts, errores públicos genéricos y requestId en logs JSON con duración y código HTTP; sin tokens ni payloads.'],
 ['Evolución CP2','Motor reproducible con semilla, transacción e idempotencia. IA narrativa recibe resultado confirmado; valida JSON/hechos y usa fallback ante fallo.']
], [140,content-140])
story.append(Spacer(1,10))
add('<b>Relaciones actuales:</b> Auth users 1 → 0..1 careers; dataset_versions 1 → N careers. Los planteles reales y el estado simulado de cada carrera se mantendrán separados.','SmallCP')

page('Decisiones y operación reproducible','04 / JUSTIFICACIÓN Y SETUP')
table(['DECISIÓN','MOTIVO','LÍMITE'],[
 ['Next.js / Vercel','Stack del one-pager; interfaz web y despliegue gestionado.','Hobby para uso académico no comercial; reevaluar al monetizar.'],
 ['Supabase / SQL / Auth / Functions','Reducir configuración operativa del equipo y preservar reglas en SQL/TypeScript.','Dependencia del proveedor y cuotas gratuitas; no se promete SLA.'],
 ['RLS + JWT del usuario','Aislar carreras también ante acceso REST directo.','No usar service_role para peticiones del usuario.'],
 ['Dataset sintético CP1','Probar infraestructura sin afirmar cobertura o licencias no validadas.','API-Football y datos reales pendientes de CP2.'],
 ['Motor separado de IA','Resultados auditables y narrativa personalizada.','Gemini no decide marcadores ni estadísticas deportivas.']
], [155,310,content-465])
story.append(Spacer(1,12))
add('<b>Reproducir:</b> Node 22, npm ci, Docker y npm run db:start; configurar variables públicas y orígenes; npm run functions:serve y npm run dev. Validar con npm run check, npm run db:test y npm run test:integration.','SmallCP')
add('<b>Conservación:</b> no ejecutar resets, limpieza de volúmenes, force-push ni borrado de recursos. Cambios de esquema mediante migraciones aditivas.','SmallCP')

page('Validaciones y enlaces de evidencia','05 / RESULTADOS COMPROBADOS')
table(['VALIDACIÓN','RESULTADO'],[
 ['Aplicación','Lint, TypeScript y build de producción aprobados.'],
 ['Contratos','15 pruebas: entradas, suplantación de atributos, contrato narrativo y CORS.'],
 ['SQL / pgTAP','7 pruebas: propietario, lectura ajena, suplantación, unicidad, reputación y acceso anónimo.'],
 ['Integración local','10 comprobaciones del flujo real Auth → función → DB; fixtures sintéticos conservados.'],
 ['Cloud','13 comprobaciones aprobadas: Auth, guardado/recuperación, aislamiento RLS, límites y CORS; prueba de navegador publicada.'],
 ['CI','GitHub Actions: jobs de aplicación y base. Ver ejecución enlazada en evidencia.']
], [155,content-155])
story.append(Spacer(1,12))
links=[('Repositorio','https://github.com/tomasr15/camino-a-la-gloria'),('Tablero','https://github.com/users/tomasr15/projects/1'),('Supabase','https://supabase.com/dashboard/project/gmpjtvxpolmxtqvdxdit'),('Frontend',meta.get('frontend_url','Consultar el dominio definitivo en docs/evidencia-checkpoint-1.md'))]
for label,url in links:
 if url.startswith('https://'):add(f'<b>{label}:</b> <link href="{escape(url)}" color="#18705C">{escape(url)}</link>','SmallCP')
 else:add(f'<b>{label}:</b> {escape(url)}','SmallCP')

page('Trabajo del equipo y próximos pasos','06 / GESTIÓN Y DEFENSA')
table(['HITO','RESULTADO ESPERADO','RESPONSABILIDAD PROPUESTA'],[
 ['CP1 · 28/09','Revisar diagrama, setup, evidencia y auditoría; ensayar 6 minutos y enviar a la cátedra.','Los tres integrantes; revisiones cruzadas reales.'],
 ['CP2 · 09/11','Datos reales y versionados; motor, progresión, interfaz integrada y narrativa con fallback.','Lucas: datos/backend; Tomás: motor/IA; Julian: frontend.'],
 ['Final · 30/11','MVP en producción, recuperación ante fallos, observabilidad y defensa individual.','Equipo completo.']
], [120,390,content-510])
story.append(Spacer(1,14))
add('<b>Kanban:</b> Pendiente → En curso → En revisión → Hecho. WIP: una tarea en curso por integrante y hasta dos PR en revisión. Las tareas con criterios de aceptación están registradas en GitHub.')
add('<b>Operación pendiente:</b> habilitar secretos del workflow manual de backend si se decide usar Actions para ese despliegue; probar SMTP antes de abrir registro a usuarios externos. Backend CP1 desplegado desde CLI autenticada.','SmallCP')
add('<b>Pendientes humanos:</b> revisión de código y AI-DECISIONS, comprensión individual, acceso de la cátedra al repositorio privado y envío formal. No se presentan como realizados por la asistencia.')
add('<b>Fuentes:</b> Camino a la Gloria (2).pdf, p. 1; TPI - Desarrollo de Software Cloud (1).pdf, pp. 1-4. Referencias técnicas y condiciones de proveedores en docs/decisiones.md.','SmallCP')

def footer(canvas,doc):
 canvas.setStrokeColor(colors.HexColor('#CFDDD7'));canvas.line(42,31,W-42,31)
 canvas.setFont('Helvetica',8);canvas.setFillColor(GRAY)
 canvas.drawString(42,19,'CAMINO A LA GLORIA · CHECKPOINT 1 · 28/09/2026')
 canvas.drawRightString(W-42,19,f'{doc.page}')

pdf=SimpleDocTemplate(str(OUT/'Checkpoint-1-Camino-a-la-Gloria.pdf'),pagesize=(W,H),rightMargin=42,leftMargin=42,topMargin=30,bottomMargin=43,title='Camino a la Gloria - Checkpoint 1',author='Equipo Camino a la Gloria / preparación asistida por Codex')
pdf.build(story,onFirstPage=footer,onLaterPages=footer)
print('Generated report and architecture diagrams in docs/entrega.')
