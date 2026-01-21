// CSS animations and pseudo-element styles for AI glass effect
// This string can be injected via <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
export const aiGlassAnimations = `
  .ai-glass-border {
    position: relative;
    --border-color: 255, 255, 255; /* Default: white, can be overridden inline */
    --border-opacity: 0;
    --border-width: 1px;
    --border-brightness: 1.85;
    --border-fade: 50;
  }
  .ai-glass-border::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: var(--border-width);
    background: linear-gradient(20deg, transparent 0%, rgba(var(--border-color), var(--border-opacity)) 22%, rgba(var(--border-color), var(--border-opacity)) 78%, transparent 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
    z-index: 1;
  }
  @keyframes flowingGradient {
    0% {
      background-position: 0% 50%;
      filter: hue-rotate(0deg);
    }
    25% {
      background-position: 50% 100%;
    }
    50% {
      background-position: 100% 50%;
      filter: hue-rotate(15deg);
    }
    75% {
      background-position: 50% 0%;
    }
    100% {
      background-position: 0% 50%;
      filter: hue-rotate(0deg);
    }
  }
  @keyframes flowingGradientReverse {
    0% {
      background-position: 100% 50%;
      filter: hue-rotate(0deg);
    }
    25% {
      background-position: 50% 0%;
    }
    50% {
      background-position: 0% 50%;
      filter: hue-rotate(-15deg);
    }
    75% {
      background-position: 50% 100%;
    }
    100% {
      background-position: 100% 50%;
      filter: hue-rotate(0deg);
    }
  }
  @keyframes flowDiagonal {
    0% {
      background-position: 0% 0%;
    }
    50% {
      background-position: 100% 100%;
    }
    100% {
      background-position: 0% 0%;
    }
  }
  @keyframes flowDiagonalReverse {
    0% {
      background-position: 100% 0%;
    }
    50% {
      background-position: 0% 100%;
    }
    100% {
      background-position: 100% 0%;
    }
  }
  @keyframes flowVertical {
    0% {
      background-position: 50% 0%;
    }
    50% {
      background-position: 50% 100%;
    }
    100% {
      background-position: 50% 0%;
    }
  }
  @keyframes flowCircular {
    0% {
      background-position: 50% 0%;
    }
    25% {
      background-position: 100% 50%;
    }
    50% {
      background-position: 50% 100%;
    }
    75% {
      background-position: 0% 50%;
    }
    100% {
      background-position: 50% 0%;
    }
  }
  @keyframes floatFree1 {
    0% { transform: translate(0%, 0%) scale(1); }
    20% { transform: translate(15%, -25%) scale(1.2); }
    40% { transform: translate(-10%, 20%) scale(0.8); }
    60% { transform: translate(25%, 10%) scale(1.1); }
    80% { transform: translate(-20%, -15%) scale(0.9); }
    100% { transform: translate(0%, 0%) scale(1); }
  }
  @keyframes floatFree2 {
    0% { transform: translate(0%, 0%) scale(1); }
    25% { transform: translate(-20%, 15%) scale(0.9); }
    50% { transform: translate(10%, -20%) scale(1.3); }
    75% { transform: translate(20%, 25%) scale(0.7); }
    100% { transform: translate(0%, 0%) scale(1); }
  }
  @keyframes floatFree3 {
    0% { transform: translate(0%, 0%) scale(1); }
    15% { transform: translate(20%, 20%) scale(1.1); }
    35% { transform: translate(-15%, -10%) scale(0.85); }
    55% { transform: translate(-25%, 15%) scale(1.25); }
    75% { transform: translate(10%, -25%) scale(0.95); }
    100% { transform: translate(0%, 0%) scale(1); }
  }
  @keyframes floatFree4 {
    0% { transform: translate(0%, 0%) scale(1); }
    30% { transform: translate(-10%, -20%) scale(1.15); }
    50% { transform: translate(25%, 5%) scale(0.8); }
    70% { transform: translate(-5%, 25%) scale(1.2); }
    100% { transform: translate(0%, 0%) scale(1); }
  }
  @keyframes floatFree5 {
    0% { transform: translate(0%, 0%) scale(1); }
    20% { transform: translate(10%, 15%) scale(0.9); }
    45% { transform: translate(-20%, -5%) scale(1.3); }
    65% { transform: translate(15%, -20%) scale(0.85); }
    85% { transform: translate(-15%, 10%) scale(1.1); }
    100% { transform: translate(0%, 0%) scale(1); }
  }
  @keyframes floatFree6 {
    0% { transform: translate(0%, 0%) scale(1); }
    25% { transform: translate(-25%, -15%) scale(1.2); }
    55% { transform: translate(20%, 20%) scale(0.75); }
    80% { transform: translate(5%, -25%) scale(1.15); }
    100% { transform: translate(0%, 0%) scale(1); }
  }
  @keyframes iosWiggle {
    0% { transform: rotate(-1deg); }
    25% { transform: rotate(1deg); }
    50% { transform: rotate(-1deg); }
    75% { transform: rotate(1deg); }
    100% { transform: rotate(-1deg); }
  }
  .ios-wiggle {
    animation: iosWiggle 0.3s ease-in-out infinite;
  }
  @keyframes settleDown {
    0% {
      transform: rotate(-1deg) scale(1.02);
      filter: brightness(1.1);
    }
    50% {
      transform: rotate(0deg) scale(1.05);
      filter: brightness(1.15);
    }
    100% {
      transform: rotate(0deg) scale(1);
      filter: brightness(1);
    }
  }
  .settle-animation {
    animation: settleDown 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
`;
