// Testes do importador de extrato, sem dependência nova: node --experimental-strip-types scripts/testa-import.mts
// (o Node 22.18+ já lê TypeScript direto). Cobre dinheiro, texto, hash, leitura de CSV/OFX e a prévia.
import assert from 'node:assert/strict'
import { lerDinheiro, lerValorComSinal } from '../src/lib/import/dinheiro.ts'
import { nomeFornecedorLimpo, normalizar, sugerirTrecho } from '../src/lib/import/texto.ts'
import { hashDaLinha } from '../src/lib/import/hash.ts'
import { decodificar, detectarSeparador, ErroImportacao, lerData, lerExtrato } from '../src/lib/import/parser.ts'
import { montarEnvio, montarPrevia, sugerirMapeamento, type FornecedorImport } from '../src/lib/import/previa.ts'

let total = 0
const t = async (nome: string, fn: () => void | Promise<void>) => {
  try { await fn(); total++; console.log('  ok  ' + nome) } catch (e) { console.error('FALHOU: ' + nome); throw e }
}
const bytes = (s: string) => new TextEncoder().encode(s)

// ---- dinheiro ----------------------------------------------------------------------------------
await t('lerDinheiro: formatos brasileiros e com ponto', () => {
  assert.equal(lerDinheiro('340'), 34000)
  assert.equal(lerDinheiro('340,5'), 34050)
  assert.equal(lerDinheiro('1.234,56'), 123456)
  assert.equal(lerDinheiro('R$ 12,00'), 1200)
  assert.equal(lerDinheiro('12.50'), 1250)
  assert.equal(lerDinheiro('1.234'), 123400)        // ponto de milhar
  assert.equal(lerDinheiro('1.005,5'), 100550)
  assert.equal(lerDinheiro('0,005'), 1)             // meio centavo sobe, sem erro de ponto flutuante
  assert.equal(lerDinheiro('1,005'), 101)
})
await t('lerDinheiro: recusa lixo, negativo e valor absurdo', () => {
  for (const x of ['', '  ', 'abc', '-5,00', '1,2,3', '12,3x', null, undefined, '99999999999']) assert.equal(lerDinheiro(x as string), null, String(x))
})
await t('lerValorComSinal: como os bancos imprimem', () => {
  assert.equal(lerValorComSinal('-1.234,56'), -123456)
  assert.equal(lerValorComSinal('1.234,56-'), -123456)
  assert.equal(lerValorComSinal('(12,00)'), -1200)
  assert.equal(lerValorComSinal('R$ -5,00'), -500)
  assert.equal(lerValorComSinal('12,00 D'), -1200)
  assert.equal(lerValorComSinal('12,00 C'), 1200)
  assert.equal(lerValorComSinal('+7,5'), 750)
  assert.equal(lerValorComSinal('--5'), null)
  assert.equal(lerValorComSinal('texto'), null)
})

// ---- texto e hash ------------------------------------------------------------------------------
await t('normalizar: maiúsculas, sem acento, sem símbolos', () => {
  assert.equal(normalizar('  Pix Enviado – Açougue São João!  '), 'PIX ENVIADO ACOUGUE SAO JOAO')
  assert.equal(normalizar(null), '')
})
await t('sugerirTrecho e nomeFornecedorLimpo ignoram palavras genéricas e números', () => {
  assert.equal(sugerirTrecho('PIX ENVIADO CEASA HORTIFRUTI 123456'), 'CEASA HORTIFRUTI')
  assert.equal(nomeFornecedorLimpo('PIX ENVIADO CEASA HORTIFRUTI 123456'), 'Ceasa Hortifruti')
  assert.equal(nomeFornecedorLimpo('PIX 123 456'), 'Fornecedor não identificado')
  assert.ok(nomeFornecedorLimpo('X'.repeat(200) + ' ' + 'Y'.repeat(200)).length <= 60)
})
await t('hashDaLinha: estável, 32 hex em maiúsculas, e a ocorrência muda o valor', async () => {
  const a = await hashDaLinha('2026-10-23', -34000, 'PIX CEASA', 1)
  assert.match(a, /^[0-9A-F]{32}$/)
  assert.equal(a, await hashDaLinha('2026-10-23', -34000, 'pix  ceasa', 1)) // normaliza a descrição
  assert.notEqual(a, await hashDaLinha('2026-10-23', -34000, 'PIX CEASA', 2))
  assert.notEqual(a, await hashDaLinha('2026-10-24', -34000, 'PIX CEASA', 1))
  assert.notEqual(a, await hashDaLinha('2026-10-23', 34000, 'PIX CEASA', 1))  // o sinal conta
  // vetores fixos, calculados por fora com `sha256sum` sobre a mesma chave que o app desktop usa:
  //   "2026-10-23|-34000|PIX CEASA"  e  "2026-10-23|-34000|PIX CEASA#2"  (primeiros 32 caracteres, em maiúsculas)
  assert.equal(a, '7593A7535A82BA52C9B624A8568F05E5')
  assert.equal(await hashDaLinha('2026-10-23', -34000, 'PIX CEASA', 2), '5DE707B545C5C19EE90A12877BBBB770')
})

// ---- datas -------------------------------------------------------------------------------------
await t('lerData: formatos, hora colada e datas impossíveis', () => {
  assert.equal(lerData('23/10/2026', 'dd/MM/yyyy'), '2026-10-23')
  assert.equal(lerData('23/10/2026 14:05:00', 'dd/MM/yyyy'), '2026-10-23')
  assert.equal(lerData('2026-10-23T14:05:00', 'yyyy-MM-dd'), '2026-10-23')
  assert.equal(lerData('20261023', 'yyyyMMdd'), '2026-10-23')
  assert.equal(lerData('23.10.26', 'dd.MM.yy'), '2026-10-23')
  assert.equal(lerData('01/01/99', 'dd/MM/yy'), '1999-01-01')   // regra do .NET: 30 a 99 é século 20
  assert.equal(lerData('31/02/2026', 'dd/MM/yyyy'), null)
  assert.equal(lerData('29/02/2024', 'dd/MM/yyyy'), '2024-02-29')
  assert.equal(lerData('29/02/2026', 'dd/MM/yyyy'), null)
  assert.equal(lerData('23/10/2026', 'yyyy-MM-dd'), null)
  assert.equal(lerData('1/2/2026', 'dd/MM/yyyy'), null)          // exige dois dígitos
  assert.equal(lerData('', 'dd/MM/yyyy'), null)
})

// ---- leitura -----------------------------------------------------------------------------------
const CSV_BR = [
  'Extrato da conta;;;', 'Período: outubro;;;',
  'Data;Histórico;Valor;Saldo',
  '23/10/2026;PIX ENVIADO CEASA HORTIFRUTI;-340,00;1.000,00',
  '22/10/2026;COMGAS GAS NATURAL;-1.250,30;1.340,00',
  '21/10/2026;PIX RECEBIDO CLIENTE;500,00;2.590,30',
  '',
].join('\r\n')

await t('lerExtrato: CSV brasileiro com título antes da tabela, sugere as colunas', () => {
  const e = lerExtrato(bytes(CSV_BR), 'extrato.csv')
  assert.equal(e.tipo, 'csv'); assert.equal(e.separador, ';'); assert.equal(e.temCabecalho, true)
  assert.deepEqual(e.cabecalhos, ['Data', 'Histórico', 'Valor', 'Saldo'])
  assert.equal(e.linhas.length, 3)
  assert.equal(e.sugestao.data, 'Data'); assert.equal(e.sugestao.valor, 'Valor')   // Saldo perde para Valor
  assert.equal(e.sugestao.descricao, 'Histórico'); assert.equal(e.sugestao.formatoData, 'dd/MM/yyyy')
  assert.equal(e.sugestao.saidaPositiva, false)  // há valores negativos
})
await t('lerExtrato: pagamentos positivos são detectados', () => {
  const e = lerExtrato(bytes('Data;Descrição;Valor\n23/10/2026;PADARIA;45,00\n22/10/2026;MERCADO;120,50\n'), 'x.csv')
  assert.equal(e.sugestao.saidaPositiva, true)
})
await t('lerExtrato: vírgula, aspas com separador dentro e sem cabeçalho', () => {
  const e = lerExtrato(bytes('2026-10-23,"PIX, CEASA ""HORTI""",-340.00\n2026-10-22,GAS,-80.00\n'), 'x.csv')
  assert.equal(e.separador, ','); assert.equal(e.temCabecalho, false)
  assert.equal(e.linhas[0][1], 'PIX, CEASA "HORTI"')
  assert.equal(e.sugestao.formatoData, 'yyyy-MM-dd')
})
await t('lerExtrato: Latin-1 (acentos) e BOM de UTF-8', () => {
  const latin1 = Uint8Array.from([...'Data;Descrição;Valor\n23/10/2026;AÇOUGUE;-10,00\n'].map((c) => c.charCodeAt(0)))
  const e = lerExtrato(latin1, 'x.csv')
  assert.equal(e.codificacao, 'latin1'); assert.equal(e.linhas[0][1], 'AÇOUGUE')
  const bom = Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes('Data;Descrição;Valor\n23/10/2026;AÇOUGUE;-10,00\n')])
  assert.equal(decodificar(bom).codificacao, 'utf-8'); assert.equal(lerExtrato(bom, 'x.csv').linhas[0][1], 'AÇOUGUE')
})
await t('detectarSeparador escolhe ; , tab e |', () => {
  assert.equal(detectarSeparador('a;b;c\n1;2;3'), ';'); assert.equal(detectarSeparador('a,b,c\n1,2,3'), ',')
  assert.equal(detectarSeparador('a\tb\tc\n1\t2\t3'), '\t'); assert.equal(detectarSeparador('a|b|c\n1|2|3'), '|')
})
await t('lerExtrato: linha com colunas a mais é contada como malformada, não some', () => {
  const e = lerExtrato(bytes('Data;Descrição;Valor\n23/10/2026;A;-1,00\n22/10/2026;B;extra;-2,00\n21/10/2026;C;-3,00\n'), 'x.csv')
  assert.equal(e.linhas.length, 2); assert.equal(e.malformadas, 1)
})
await t('lerExtrato: erros em português simples', () => {
  const erro = (b: Uint8Array, n = 'x.csv') => assert.throws(() => lerExtrato(b, n), ErroImportacao)
  erro(new Uint8Array(0)); erro(bytes('só uma coluna\noutra linha')); erro(bytes('Data;Valor\nsem;datas\nnem;valores'))
  erro(bytes('a;b\n"aberta;1')); erro(Uint8Array.from([0x00, 0x01, 0x02, 0x03]))
  erro(new Uint8Array(2 * 1024 * 1024 + 1))
  erro(bytes('<OFX></OFX>'), 'x.ofx')
})
await t('lerExtrato: limite de 5.000 linhas', () => {
  const grande = 'Data;Descrição;Valor\n' + Array.from({ length: 5001 }, (_, i) => `23/10/2026;L${i};-1,00`).join('\n')
  assert.throws(() => lerExtrato(bytes(grande), 'x.csv'), /limite/)
})

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261023120000[-3:BRT]<TRNAMT>-340.00<NAME>CEASA HORTIFRUTI<MEMO>PIX ENVIADO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261022<TRNAMT>1234.5<MEMO>VENDA CARTAO
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261021<TRNAMT>-340.005<NAME>MESMO<MEMO>MESMO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<TRNAMT>-1.00<NAME>SEM DATA</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
await t('lerExtrato: OFX (valores com ponto, sem fechar tag, movimento sem data)', () => {
  const e = lerExtrato(bytes(OFX), 'extrato.ofx')
  assert.equal(e.tipo, 'ofx'); assert.equal(e.linhas.length, 3); assert.equal(e.malformadas, 1)
  assert.deepEqual(e.linhas[0], ['2026-10-23', 'CEASA HORTIFRUTI - PIX ENVIADO', '-340,00'])
  assert.deepEqual(e.linhas[1], ['2026-10-22', 'VENDA CARTAO', '1234,50'])
  assert.deepEqual(e.linhas[2], ['2026-10-21', 'MESMO', '-340,01'])   // 3 casas arredondam, e NAME = MEMO não repete
  assert.equal(lerValorComSinal(e.linhas[0][2]), -34000)
  assert.equal(lerValorComSinal(e.linhas[1][2]), 123450)
})

// ---- prévia ------------------------------------------------------------------------------------
const fornecedores: FornecedorImport[] = [
  { id: 'f-ceasa', cnpj: '11222333000181', legal_name: 'Ceasa Hortifruti LTDA', trade_name: null, nickname: 'Ceasa', default_category_id: 'c-horti' },
  { id: 'f-sem', cnpj: null, legal_name: null, trade_name: null, nickname: 'Padaria Lua', default_category_id: null },
]
const regras = [{ pattern_text: 'COMGAS', category_id: 'c-gas' }, { pattern_text: 'GAS', category_id: 'c-curta' }]
const ctx = (hashes: string[] = []) => ({ hashesExistentes: new Set(hashes), regras, fornecedores })

await t('montarPrevia: categoria por regra, por fornecedor, e "para revisar"', async () => {
  const e = lerExtrato(bytes(CSV_BR), 'extrato.csv')
  const p = await montarPrevia(e, sugerirMapeamento(e), false, ctx())
  assert.equal(p.linhas.length, 2); assert.equal(p.entradasIgnoradas, 1); assert.equal(p.naoLidas, 0)
  const [ceasa, gas] = p.linhas
  assert.equal(ceasa.fornecedorId, 'f-ceasa'); assert.equal(ceasa.categoriaId, 'c-horti'); assert.equal(ceasa.origem, 'fornecedor'); assert.equal(ceasa.incluir, true)
  assert.equal(gas.categoriaId, 'c-gas'); assert.equal(gas.origem, 'regra')   // a regra mais comprida vence
  assert.equal(ceasa.centavos, -34000); assert.equal(gas.centavos, -125030)
})
await t('montarPrevia: fornecedor pelo CNPJ no texto e por nome; sem categoria fica desmarcada', async () => {
  const e = lerExtrato(bytes('Data;Histórico;Valor\n23/10/2026;PAGAMENTO 11.222.333/0001-81;-10,00\n22/10/2026;COMPRA PADARIA LUA;-5,00\n21/10/2026;PIX FULANO;-7,00\n'), 'x.csv')
  const p = await montarPrevia(e, sugerirMapeamento(e), false, ctx())
  assert.equal(p.linhas[0].fornecedorId, 'f-ceasa')
  assert.equal(p.linhas[1].fornecedorId, 'f-sem'); assert.equal(p.linhas[1].categoriaId, null); assert.equal(p.linhas[1].incluir, false)
  assert.equal(p.linhas[2].fornecedorId, null); assert.equal(p.linhas[2].incluir, false)
})
await t('montarPrevia: entradas só entram se pedido; linhas ilegíveis são contadas', async () => {
  const e = lerExtrato(bytes('Data;Histórico;Valor\n23/10/2026;A;-1,00\n22/10/2026;B;0,00\n21/10/2026;C;500,00\n'), 'x.csv')
  const sem = await montarPrevia(e, sugerirMapeamento(e), false, ctx())
  assert.equal(sem.linhas.length, 1); assert.equal(sem.entradasIgnoradas, 1); assert.equal(sem.naoLidas, 1) // valor zero não é movimento
  const com = await montarPrevia(e, sugerirMapeamento(e), true, ctx())
  assert.equal(com.linhas.length, 2); assert.equal(com.linhas[1].ehSaida, false)
})
await t('montarPrevia: pagamentos positivos (saidaPositiva) invertem saída e entrada', async () => {
  const e = lerExtrato(bytes('Data;Descrição;Valor\n23/10/2026;PADARIA;45,00\n22/10/2026;MERCADO;120,50\n'), 'x.csv')
  const p = await montarPrevia(e, sugerirMapeamento(e), false, ctx())
  assert.equal(p.linhas.length, 2); assert.ok(p.linhas.every((l) => l.ehSaida))
})
await t('montarPrevia: reimportar o mesmo arquivo marca tudo como duplicado e não envia nada', async () => {
  const e = lerExtrato(bytes(CSV_BR), 'extrato.csv')
  const primeira = await montarPrevia(e, sugerirMapeamento(e), true, ctx())
  const de = await montarPrevia(e, sugerirMapeamento(e), true, ctx(primeira.linhas.map((l) => l.hash)))
  assert.ok(de.linhas.every((l) => l.duplicada && !l.incluir))
  const envio = montarEnvio(de.linhas)
  assert.equal(envio.expenses.length, 0); assert.equal(envio.revenues.length, 0); assert.equal(envio.duplicates, 3)
})
await t('montarPrevia: duas linhas idênticas no mesmo arquivo são dois pagamentos (hash com #2)', async () => {
  const e = lerExtrato(bytes('Data;Descrição;Valor\n23/10/2026;CAFE;-5,00\n23/10/2026;CAFE;-5,00\n22/10/2026;OUTRO;-1,00\n'), 'x.csv')
  const p = await montarPrevia(e, sugerirMapeamento(e), false, ctx())
  assert.equal(new Set(p.linhas.map((l) => l.hash)).size, 3)
})
await t('montarPrevia: pede coluna que não existe', async () => {
  const e = lerExtrato(bytes(CSV_BR), 'extrato.csv')
  await assert.rejects(() => montarPrevia(e, { ...sugerirMapeamento(e), colValor: 'Inexistente' }, false, ctx()), /Escolha qual coluna/)
})
await t('montarEnvio: fornecedor novo leva o nome limpo; revisar e desmarcadas não vão', async () => {
  const e = lerExtrato(bytes('Data;Histórico;Valor\n23/10/2026;PIX ENVIADO ACOUGUE DO ZE 99;-80,00\n22/10/2026;PIX ENVIADO FULANO DE TAL;-10,00\n21/10/2026;DEPOSITO;300,00\n'), 'x.csv')
  const p = await montarPrevia(e, sugerirMapeamento(e), true, ctx())
  p.linhas[0].categoriaId = 'c-carnes'; p.linhas[0].incluir = true     // a pessoa escolheu a categoria
  // p.linhas[1] fica sem categoria (revisar); a entrada vai para o faturamento
  const envio = montarEnvio(p.linhas)
  assert.equal(envio.expenses.length, 1); assert.equal(envio.expenses[0].supplier_id, null)
  assert.equal(envio.expenses[0].supplier_name, 'Acougue Ze'); assert.equal(envio.expenses[0].amount_cents, 8000)
  assert.equal(envio.to_review, 1); assert.equal(envio.revenues.length, 1); assert.equal(envio.revenues[0].gross_cents, 30000)
})

// ---- correções da revisão ----------------------------------------------------------------------
import { dataPlausivel } from '../src/lib/import/previa.ts'
await t('dataPlausivel: o banco só aceita de 01/01/2000 até 1 ano à frente', () => {
  assert.equal(dataPlausivel('2000-01-01', '2026-10-23'), true)
  assert.equal(dataPlausivel('1999-12-31', '2026-10-23'), false)
  assert.equal(dataPlausivel('2027-10-24', '2026-10-23'), true)   // hoje + 366 dias
  assert.equal(dataPlausivel('2027-10-25', '2026-10-23'), false)
  assert.equal(dataPlausivel('1950-05-05', '2026-10-23'), false)
})
await t('montarPrevia: data fora do intervalo vira "não consegui ler" em vez de derrubar o arquivo', async () => {
  const e = lerExtrato(bytes('Data;Histórico;Valor\n23/10/2026;OK;-1,00\n23/10/1950;ANTIGA;-2,00\n23/10/2090;FUTURA;-3,00\n'), 'x.csv')
  const p = await montarPrevia(e, sugerirMapeamento(e), false, { ...ctx(), hoje: '2026-10-23' })
  assert.equal(p.linhas.length, 1); assert.equal(p.naoLidas, 2)
})
await t('lerExtrato: arquivo com linhas demais é cortado antes do trabalho pesado', () => {
  const enorme = 'Data;Descrição;Valor\n' + Array.from({ length: 5400 }, (_, i) => `23/10/2026;L${i};-1,00`).join('\n')
  assert.throws(() => lerExtrato(bytes(enorme), "x.csv"), /mais de 5000 linhas; o limite é 5000/)
})
await t('regra sugerida por sugerirTrecho casa com a própria descrição (mesmo sem as palavras genéricas)', async () => {
  const desc = 'PIX ENVIADO ACOUGUE DO ZE 2'
  const trecho = sugerirTrecho(desc)           // "ACOUGUE ZE": o "DO" sai da sugestão
  assert.equal(trecho, 'ACOUGUE ZE')
  const e = lerExtrato(bytes('Data;Histórico;Valor\n23/10/2026;' + desc + ';-80,00\n22/10/2026;PADARIA;-5,00\n'), 'x.csv')
  const p = await montarPrevia(e, sugerirMapeamento(e), false, { ...ctx(), regras: [{ pattern_text: trecho, category_id: 'c-carnes' }] })
  assert.equal(p.linhas[0].categoriaId, 'c-carnes'); assert.equal(p.linhas[0].origem, 'regra')
  assert.equal(p.linhas[1].categoriaId, null)  // não casa com o que não tem relação
})
await t('regra antiga com palavra genérica continua valendo', async () => {
  const e = lerExtrato(bytes('Data;Histórico;Valor\n23/10/2026;PIX ENVIADO CEASA 22;-80,00\n22/10/2026;OUTRA COISA;-5,00\n'), 'x.csv')
  const p = await montarPrevia(e, sugerirMapeamento(e), false, { ...ctx(), regras: [{ pattern_text: 'PIX ENVIADO CEASA 22', category_id: 'c-x' }] })
  assert.equal(p.linhas[0].categoriaId, 'c-x')
})

console.log(`\n${total} testes do importador passaram.`)
