/**
 * Favorito (bookmarklet) "STIMMA · Copiar agenda": roda na agenda do Simples Dental, no navegador
 * de quem clica, e SÓ LÊ a tela — consultas de pacientes de hoje e amanhã (fuso de Brasília),
 * ignorando lembretes internos ("Compromisso"). Copia um JSON no formato stimma-agenda-v1 para a
 * área de transferência; nada é clicado nem alterado no Simples Dental.
 *
 * Depende da estrutura atual da tela (eventos com data-consulta-id/data-start/data-end e títulos
 * de status e procedimento). Quando a tela expõe os dados do evento (nome e data de nascimento da
 * paciente, status), usa esses; a data de nascimento só serve para vincular com segurança e não é
 * exibida. Se a tela mudar, o favorito encontra 0 consultas e o STIMMA OS avisa —
 * nunca adivinha.
 */
const CODIGO = `(()=>{
if(!location.hostname.endsWith('simplesdental.com')){alert('Abra a agenda do Simples Dental e clique no favorito lá.');return;}
const fmt=x=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(+x));
const hoje=fmt(Date.now()),amanha=fmt(Date.now()+864e5);
const vistos=new Set(),itens=[];
document.querySelectorAll('.fc-event[data-consulta-id]').forEach(e=>{
const id=e.getAttribute('data-consulta-id');if(!id||vistos.has(id))return;vistos.add(id);
const ini=e.getAttribute('data-start'),fim=e.getAttribute('data-end');const dia=fmt(ini);if(dia!==hoje&&dia!==amanha)return;
const linha=(e.innerText.split('\\n')[1]||'').trim();const k=linha.lastIndexOf(' - Dr(a). ');
const t=[...e.querySelectorAll('[title]')].map(x=>x.getAttribute('title'));
const p=(e.fcSeg&&e.fcSeg.eventRange&&e.fcSeg.eventRange.def&&e.fcSeg.eventRange.def.extendedProps)||{};const pac=p.paciente||{};
itens.push({id,inicio:new Date(+ini).toISOString(),fim:new Date(+fim).toISOString(),paciente:pac.nome||(k>0?linha.slice(0,k):linha),nascimento:(pac.dtNascimento||'').slice(0,10),profissional:k>0?linha.slice(k+10):'',status:p.status||t[0]||'',motivo:t[1]||''});
});
const txt=JSON.stringify({formato:'stimma-agenda-v1',lido_em:new Date().toISOString(),itens});
const ok=()=>alert(itens.length+' consulta(s) de hoje e amanhã copiadas. Volte ao STIMMA OS e cole em Sincronizar agenda.');
navigator.clipboard.writeText(txt).then(ok,()=>prompt('Copie o texto abaixo (Ctrl+C) e cole no STIMMA OS:',txt));
})()`;

/** href do favorito (uma linha, sem quebras). */
export const HREF_FAVORITO_AGENDA = `javascript:${encodeURIComponent(CODIGO.replace(/\n/g, ""))}`;

/** Mesmo código, legível, para quem preferir pedir à extensão do Claude que o execute. */
export const CODIGO_FAVORITO_AGENDA = CODIGO;
