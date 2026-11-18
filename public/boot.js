// Aplica o tema e o tamanho do texto antes de desenhar a tela, para não piscar.
// Fica num arquivo próprio (e não dentro do index.html) para a política de segurança do site poder proibir scripts embutidos.
try {
  var tema = localStorage.getItem('ca-tema')
  var texto = localStorage.getItem('ca-texto')
  if (tema === 'escuro') document.documentElement.classList.add('dark')
  if (texto) document.documentElement.setAttribute('data-texto', texto)
} catch (e) { /* sem armazenamento: usa o padrão */ }
