/** Decorative, lightweight science artwork for the learning catalogue. */
export default function ScienceBackdrop() {
  return <div className="science-backdrop" aria-hidden="true">
    <span className="science-equation science-equation-one">E = mc²</span>
    <span className="science-equation science-equation-two">a² + b² = c²</span>
    <span className="science-equation science-equation-three">∫ x² dx</span>
    <span className="science-equation science-equation-four">H₂O · CO₂</span>
    <span className="science-equation science-equation-five">f(x) = sin x</span>
    <svg className="science-orbit science-orbit-one" viewBox="0 0 180 120" fill="none">
      <ellipse cx="90" cy="60" rx="76" ry="27"/><ellipse cx="90" cy="60" rx="76" ry="27" transform="rotate(58 90 60)"/><ellipse cx="90" cy="60" rx="76" ry="27" transform="rotate(-58 90 60)"/><circle cx="90" cy="60" r="5"/><circle className="science-orbit-dot" cx="163" cy="58" r="4"/>
    </svg>
    <svg className="science-lab-art" viewBox="0 0 260 250" fill="none">
      <defs>
        <linearGradient id="tubeGlass" x1="93" y1="42" x2="178" y2="201" gradientUnits="userSpaceOnUse"><stop stopColor="#fff" stopOpacity=".78"/><stop offset="1" stopColor="#93d9ec" stopOpacity=".14"/></linearGradient>
        <linearGradient id="tubeLiquid" x1="118" y1="112" x2="169" y2="188" gradientUnits="userSpaceOnUse"><stop stopColor="#ed4264"/><stop offset="1" stopColor="#cb2a86"/></linearGradient>
        <clipPath id="tubeClip"><path d="M119 53h37v100l24 35c9 13 0 30-16 30h-53c-16 0-25-17-16-30l24-35V53Z"/></clipPath>
      </defs>
      <path className="science-triangle science-triangle-one" d="m12 176 34-78 38 78H12Z"/>
      <path className="science-triangle science-triangle-two" d="m198 162 26-70 28 70h-54Z"/>
      <path className="science-triangle science-triangle-inner" d="m208 151 16-43 17 43h-33Z"/>
      <path className="science-triangle-measure" d="M46 98v78M198 162h54M224 92v70"/>
      <path className="science-angle-mark" d="M38 160c7-3 11-9 12-17M232 151c-5-2-8-6-9-12"/>
      <circle className="science-vertex" cx="46" cy="98" r="2.5"/><circle className="science-vertex" cx="12" cy="176" r="2.5"/><circle className="science-vertex" cx="84" cy="176" r="2.5"/>
      <text className="science-math-label" x="28" y="139">h</text><text className="science-math-label" x="54" y="173">a</text><text className="science-math-label" x="229" y="130">b</text><text className="science-math-label" x="199" y="87">c</text><text className="science-math-label" x="45" y="160">θ</text>
      <g className="science-test-tube">
        <path d="M114 44h47M119 53h37v100l24 35c9 13 0 30-16 30h-53c-16 0-25-17-16-30l24-35V53Z" fill="url(#tubeGlass)" stroke="currentColor" strokeWidth="2.5"/>
        <rect x="111" y="42" width="53" height="12" rx="3" fill="currentColor" opacity=".76"/>
        <g clipPath="url(#tubeClip)"><path className="science-tube-fluid" d="M102 135c17-9 31 9 48 1s26-3 39 3v69h-91v-73Z" fill="url(#tubeLiquid)" opacity=".86"/><path className="science-tube-wave" d="M101 137c14-8 26 6 40 2s27-8 48 1" stroke="#fff" strokeOpacity=".84" strokeWidth="2"/><circle className="science-tube-bubble bubble-one" cx="128" cy="163" r="4"/><circle className="science-tube-bubble bubble-two" cx="153" cy="178" r="3"/><circle className="science-tube-bubble bubble-three" cx="143" cy="149" r="2.5"/></g>
        <path d="M124 62v77" stroke="#fff" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round"/>
      </g>
      <circle className="science-lab-spark" cx="52" cy="55" r="4"/><circle className="science-lab-spark science-lab-spark-two" cx="211" cy="196" r="3"/>
    </svg>
    <svg className="science-wave" viewBox="0 0 900 170" fill="none" preserveAspectRatio="none"><path d="M0 88 C80 88 80 26 160 26 S240 150 320 150 400 48 480 48 560 118 640 118 720 55 800 55 850 88 900 88"/></svg>
    <div className="science-molecule science-molecule-one"><i/><i/><i/><i/><b/><b/><b/></div>
    <div className="science-molecule science-molecule-two"><i/><i/><i/><b/><b/></div>
    <div className="science-glow science-glow-red"/><div className="science-glow science-glow-blue"/>
    <div className="science-grid"/>
  </div>;
}
