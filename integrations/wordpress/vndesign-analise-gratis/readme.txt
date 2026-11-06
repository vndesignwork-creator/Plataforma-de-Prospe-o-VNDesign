=== VNDesign — Análise grátis do site ===
Contributors: vndesign
Tags: formulário, leads, análise, bricks
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.2.0
License: GPLv2 or later

O formulário “Analisar o meu site grátis” ligado à plataforma VNDesign Leads.

== Description ==

Quem preenche o formulário entra na plataforma como lead quente (com “Ligar” para hoje), o site é analisado e recebe o diagnóstico em PDF por email.

* Elemento “Análise grátis do site” no Bricks Builder (categoria VNDesign), com textos, cores, letras, contornos e espaços.
* Shortcode `[vndesign_analise_gratis]` para outros editores; qualquer opção pode ir como atributo, ex.: `[vndesign_analise_gratis theme="light" show_company="0"]`.
* Texto de persuasão ao lado do formulário (imagem, título, texto, vantagens e nota): liga e desliga, à direita ou à esquerda, e no telemóvel antes ou depois do formulário.
* Temas escuro, claro, automático ou com as cores do teu site.
* Envia sem sair da página; sem JavaScript, envia na mesma.
* Contra spam: campo escondido para robôs e limite de pedidos na plataforma.
* Depois de enviar: mensagem ou outra página (ex.: “Obrigado” com o pixel). Dispara o evento `vnd_analise_gratis` no Google Tag Manager (dataLayer) e `vnd-fa:sent` no próprio formulário.

== Installation ==

1. Na plataforma VNDesign Leads: Definições → Formulário do site → Analisar o meu site grátis → Ligar → “Descarregar o plugin”.
2. No WordPress: Plugins → Adicionar novo → Carregar plugin → escolhe o ficheiro .zip → Instalar → Ativar.
3. Definições → Análise grátis: confirma que diz “Ligado à plataforma” e muda os textos e as cores, se quiseres.
4. No Bricks, junta o elemento “Análise grátis do site” à página. Noutros editores, usa o shortcode.

== Changelog ==

= 1.2.0 =
* Largura: “Toda a largura do sítio onde está” (de origem) ou até a uma largura máxima; espaço entre o formulário e o texto.

= 1.1.0 =
* Texto de persuasão com imagem ao lado do formulário (à direita ou à esquerda).

= 1.0.0 =
* Primeira versão.
