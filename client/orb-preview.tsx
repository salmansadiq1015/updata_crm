import { createRoot } from 'react-dom/client';
import { UpdataVoiceOrb } from './src/modules/aiCalling/ui/updata-voice-orb';
import './src/app/globals.css';

const states = [
  ['listening', 0.18, 'Listening'],
  ['processing', 0.45, 'Thinking'],
  ['speaking', 0.9, 'Speaking'],
] as const;

function Preview() {
  return (
    <main style={{ minHeight: '100vh', padding: 48, background: '#050817', color: '#e2e8f0', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <div style={{ color: '#67e8f9', fontSize: 11, fontWeight: 700, letterSpacing: '.24em', textTransform: 'uppercase' }}>Voice intelligence</div>
        <h1 style={{ fontSize: 30, margin: '16px 0 40px' }}>Conversation-reactive orb</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {states.map(([state, level, title]) => (
            <section key={state} style={{ position: 'relative', minHeight: 440, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 24, border: '1px solid rgba(255,255,255,.1)', background: 'radial-gradient(circle at 45% 42%,rgba(14,165,233,.11),transparent 34%),radial-gradient(circle at 65% 50%,rgba(168,85,247,.12),transparent 45%),#090f1f' }}>
              <UpdataVoiceOrb state={state} audioLevel={level} size={300} />
              <div style={{ marginTop: -4, padding: '5px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,.1)', color: '#bae6fd', fontSize: 10, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase' }}>{title}</div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
