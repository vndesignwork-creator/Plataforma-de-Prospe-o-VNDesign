import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'A atualizar' };

/**
 * Mostrada pelo service worker quando o servidor responde 502/503/504 ou não responde
 * (a Hostinger está a publicar uma versão nova). Fica guardada no telemóvel/browser,
 * por isso não pode depender dos ficheiros do build (mudam a cada publicação): estilos
 * e script estão aqui dentro. Volta sozinha à página pedida quando o servidor responder.
 */
const retryScript = `
(function () {
  function check() {
    fetch('/api/version', { cache: 'no-store' })
      .then(function (r) { if (r.ok) location.reload(); else setTimeout(check, 5000); })
      .catch(function () { setTimeout(check, 5000); });
  }
  setTimeout(check, 4000);
})();
`;

export default function UpdatingPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
        background: '#0d0d0d',
        color: '#f4f1ea',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <p style={{ fontWeight: 700, fontSize: 20, margin: 0 }}>
        <span style={{ color: '#ef5c32' }}>VN</span>Design <span style={{ color: '#a8a39a' }}>Leads</span>
      </p>
      <h1 style={{ fontSize: 24, margin: 0 }}>A plataforma está a ser atualizada</h1>
      <p style={{ maxWidth: 420, margin: 0, color: '#a8a39a', lineHeight: 1.5 }}>
        Está a ser publicada uma versão nova. Esta página volta sozinha quando terminar — normalmente 1 a 3 minutos.
        Não precisas de fazer nada.
      </p>
      <button
        type="button"
        id="recarregar"
        style={{
          marginTop: 8,
          padding: '10px 18px',
          borderRadius: 10,
          border: 'none',
          background: '#ef5c32',
          color: '#0d0d0d',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Tentar agora
      </button>
      <script
        dangerouslySetInnerHTML={{
          __html: `${retryScript}document.getElementById('recarregar').onclick=function(){location.reload()};`,
        }}
      />
    </main>
  );
}
